/**
 * Are you absorbing the work? Pair today's session with tomorrow morning's
 * recovery. A hard day is fine; a hard day that leaves you flat the next
 * morning, then another, is the thing that eats a block.
 *
 * Pure functions only. Every cut is relative to *your* recent days, not a
 * textbook number — 40 ms of HRV can be a great morning for one athlete and
 * a crash for another.
 */
import type { RecoveryDayPoint } from './recovery-series'

export type RecoverySignal = 'hrv' | 'bodyBattery' | 'restingHr' | 'sleepHours'

export type LoadDay = {
  date: string
  daily_load: number | null
  /** Peak intensity factor of the day's rides, when FTP made it computable. */
  intensityFactor?: number | null
}

export type AbsorptionDay = {
  date: string
  load: number
  intensityFactor: number | null
  /** Tomorrow morning, signed so higher is always better. */
  recovery: number | null
  /** Tomorrow morning's raw reading, for the tooltip and the line. */
  raw: number | null
  hard: boolean
  /** null when tomorrow has no reading. */
  recovered: boolean | null
  /** This day was hard and tomorrow morning landed below your typical. */
  strained: boolean
}

export type Absorption = {
  signal: RecoverySignal
  days: AbsorptionDay[]
  verdict: 'absorbing' | 'stretched' | 'fading'
  strainedCount: number
  hardCount: number
  /** True when FTP was used to decide what counts as hard. */
  usedFtp: boolean
}

const SIGNAL_ORDER: RecoverySignal[] = ['hrv', 'bodyBattery', 'restingHr', 'sleepHours']

/** Need this many mornings of a signal before it can judge anything. */
const MIN_SIGNAL_DAYS = 5
/** Need this many days with some load before "hard" means something. */
const MIN_LOAD_DAYS = 5
const HARD_QUANTILE = 0.7
const RECOVERED_QUANTILE = 0.4
const VERDICT_WINDOW = 7
/** Coggan: IF ≥ 0.80 is tempo and above — a session that costs recovery. */
const HARD_IF = 0.8
/** A hundred TSS is an hour at FTP; above that the day was a real day. */
const HARD_TSS = 100

export const SIGNAL_LABEL: Record<RecoverySignal, string> = {
  hrv: 'HRV',
  bodyBattery: 'Body Battery',
  restingHr: 'FC de reposo',
  sleepHours: 'Sueño',
}

export const SIGNAL_UNIT: Record<RecoverySignal, string> = {
  hrv: 'ms',
  bodyBattery: '',
  restingHr: 'ppm',
  sleepHours: 'h',
}

export const VERDICT_COPY: Record<Absorption['verdict'], { label: string; note: string }> = {
  absorbing: {
    label: 'Estás absorbiendo',
    note: 'Los días duros van seguidos de mañanas normales. El bloque está entrando.',
  },
  stretched: {
    label: 'Al límite',
    note: 'Algún día duro te dejó flojo a la mañana. Una cosa; encadenarlas ya no.',
  },
  fading: {
    label: 'No estás absorbiendo',
    note: 'Varios duros seguidos de mañanas flojas. Bajá carga o dormí más antes de insistir.',
  },
}

export function pickRecoverySignal(series: RecoveryDayPoint[]): RecoverySignal | null {
  for (const signal of SIGNAL_ORDER) {
    if (countSignal(series, signal) >= MIN_SIGNAL_DAYS) return signal
  }
  return null
}

export function buildAbsorption(input: {
  series: RecoveryDayPoint[]
  loads: LoadDay[]
  ftp?: number | null
}): Absorption | null {
  const signal = pickRecoverySignal(input.series)
  if (!signal) return null

  const usedFtp = Boolean(input.ftp && input.ftp > 0)
  const loadByDate = new Map(
    input.loads.map((row) => [
      row.date,
      {
        load: Number(row.daily_load ?? 0) || 0,
        intensityFactor: row.intensityFactor ?? null,
      },
    ])
  )
  const loadValues = input.series
    .map((day) => loadByDate.get(day.date)?.load ?? 0)
    .filter((load) => load > 0)
  if (loadValues.length < MIN_LOAD_DAYS) return null

  const recoveryValues = input.series
    .map((day) => signedRecovery(day, signal))
    .filter((value): value is number => value != null)
  if (recoveryValues.length < MIN_SIGNAL_DAYS) return null

  // Flat weeks have no "hard" days: the cut has to sit above your typical day,
  // not just at the 70th percentile of a pile of similar sessions.
  const typical = quantile(loadValues, 0.5)
  const hardCut = Math.max(quantile(loadValues, HARD_QUANTILE), typical * 1.2)
  const recoveredCut = quantile(recoveryValues, RECOVERED_QUANTILE)

  const days: AbsorptionDay[] = input.series.map((day, index) => {
    const row = loadByDate.get(day.date)
    const load = row?.load ?? 0
    const intensityFactor = row?.intensityFactor ?? null
    const hard = isHard({ load, intensityFactor, hardCut, usedFtp })
    const next = input.series[index + 1]
    const recovery = next ? signedRecovery(next, signal) : null
    const raw = next ? rawRecovery(next, signal) : null
    const recovered = recovery == null ? null : recovery >= recoveredCut
    const strained = hard && recovered === false
    return { date: day.date, load, intensityFactor, recovery, raw, hard, recovered, strained }
  })

  const recent = days.slice(-VERDICT_WINDOW)
  const strainedCount = recent.filter((day) => day.strained).length
  const hardCount = days.filter((day) => day.hard).length
  const verdict: Absorption['verdict'] =
    strainedCount >= 3 ? 'fading' : strainedCount >= 1 ? 'stretched' : 'absorbing'

  return { signal, days, verdict, strainedCount, hardCount, usedFtp }
}

function isHard(input: {
  load: number
  intensityFactor: number | null
  hardCut: number
  usedFtp: boolean
}): boolean {
  if (input.load <= 0 && (input.intensityFactor == null || input.intensityFactor <= 0)) return false
  if (input.usedFtp) {
    if (input.intensityFactor != null && input.intensityFactor >= HARD_IF) return true
    if (input.load >= HARD_TSS) return true
  }
  return input.load > 0 && input.load >= input.hardCut
}

function countSignal(series: RecoveryDayPoint[], signal: RecoverySignal): number {
  return series.filter((day) => rawRecovery(day, signal) != null).length
}

function rawRecovery(day: RecoveryDayPoint, signal: RecoverySignal): number | null {
  switch (signal) {
    case 'hrv':
      return day.hrv
    case 'bodyBattery':
      return day.bodyBattery
    case 'restingHr':
      return day.restingHr
    case 'sleepHours':
      return day.sleepHours
  }
}

/** Same direction for every signal: higher means a better morning. */
function signedRecovery(day: RecoveryDayPoint, signal: RecoverySignal): number | null {
  const raw = rawRecovery(day, signal)
  if (raw == null) return null
  return signal === 'restingHr' ? -raw : raw
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const index = (sorted.length - 1) * q
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}
