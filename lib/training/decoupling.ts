/**
 * Aerobic decoupling (Pw:Hr): does the engine hold its output per heartbeat as
 * the ride goes on? Split the steady aerobic part in half and compare
 * watts-per-beat of each half. Drift over ~5% means the aerobic base is not yet
 * durable for that duration — the classic Friel read.
 *
 * Pure functions only.
 */
import { computeNormalizedPower, wattsFromOffsets } from './power-curve'

export type DecouplingSample = {
  offset_seconds: number
  power: number | null
  heart_rate: number | null
}

export type DecouplingHalf = {
  power: number
  hr: number
  /** Watts per beat. */
  ratio: number
}

export type DecouplingResult = {
  percent: number
  verdict: 'solid' | 'watch' | 'faded'
  first: DecouplingHalf
  second: DecouplingHalf
  analyzedSeconds: number
  skippedWarmupSeconds: number
}

/** Why a ride cannot be judged; the UI stays quiet rather than guessing. */
export type DecouplingSkip =
  | 'no-power'
  | 'too-short'
  | 'too-hard'

const WARMUP_SECONDS = 10 * 60
/** Below this the drift is noise, not a property of the aerobic engine. */
const MIN_ANALYZED_SECONDS = 40 * 60
/** Decoupling only means something on a steady aerobic ride. */
const MAX_HARD_SHARE = 0.15
const HARD_FRACTION_OF_FTP = 0.88

export function decouplingVerdict(percent: number): DecouplingResult['verdict'] {
  if (percent <= 5) return 'solid'
  if (percent <= 8) return 'watch'
  return 'faded'
}

export function computeDecoupling(input: {
  samples: DecouplingSample[]
  ftp: number | null
}): { result: DecouplingResult } | { skip: DecouplingSkip } {
  const { samples, ftp } = input

  const usable = samples
    .filter((s) => typeof s.power === 'number' && typeof s.heart_rate === 'number' && s.heart_rate > 0)
    .sort((a, b) => a.offset_seconds - b.offset_seconds)

  if (usable.length < 2 || !ftp) return { skip: 'no-power' }

  // The warmup is where HR is still catching up, so it would fake a drift.
  const start = usable[0].offset_seconds + WARMUP_SECONDS
  const analyzed = usable.filter((s) => s.offset_seconds >= start)
  if (analyzed.length < 2) return { skip: 'too-short' }

  // Elapsed time, not sample count: smart recording is not always 1 Hz.
  const from = analyzed[0].offset_seconds
  const to = analyzed[analyzed.length - 1].offset_seconds
  const analyzedSeconds = to - from
  if (analyzedSeconds < MIN_ANALYZED_SECONDS) return { skip: 'too-short' }

  const hard = analyzed.filter((s) => (s.power as number) > ftp * HARD_FRACTION_OF_FTP).length
  if (hard / analyzed.length > MAX_HARD_SHARE) return { skip: 'too-hard' }

  const midpoint = from + analyzedSeconds / 2
  const first = halfOf(analyzed.filter((s) => s.offset_seconds < midpoint))
  const second = halfOf(analyzed.filter((s) => s.offset_seconds >= midpoint))
  if (!first || !second) return { skip: 'no-power' }

  const percent = ((first.ratio - second.ratio) / first.ratio) * 100

  return {
    result: {
      percent: Math.round(percent * 10) / 10,
      verdict: decouplingVerdict(percent),
      first,
      second,
      analyzedSeconds,
      skippedWarmupSeconds: WARMUP_SECONDS,
    },
  }
}

function halfOf(samples: DecouplingSample[]): DecouplingHalf | null {
  if (!samples.length) return null

  // NP needs a per-second series, rebased so the half starts at zero.
  const base = samples[0].offset_seconds
  const watts = wattsFromOffsets(
    samples.map((s) => ({ offsetSeconds: s.offset_seconds - base, power: s.power }))
  )
  const raw = samples.map((s) => s.power as number)
  const power = computeNormalizedPower(watts) ?? average(raw)
  const hr = average(samples.map((s) => s.heart_rate as number))
  if (!power || !hr) return null

  return { power: Math.round(power), hr: Math.round(hr), ratio: power / hr }
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}
