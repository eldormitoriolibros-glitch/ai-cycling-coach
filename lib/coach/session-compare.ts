import { classifyEffort } from '@/lib/activities/laps'
import { parseCompactIntervals } from '@/lib/training/session-prescription'
import { looksStrength } from '@/lib/training/split-sessions'
import { TEMPLATES, type SessionKind } from '@/lib/training/planner2'

export type CompareLap = {
  moving_seconds?: number | null
  elapsed_seconds?: number | null
  avg_power?: number | null
  avg_hr?: number | null
  intensity?: string | null
}

export type SessionCompareInput = {
  workoutType: string | null | undefined
  title?: string | null
  description?: string | null
  durationMinutes: number | null | undefined
  targetZone?: string | null
  targetPower: number | null | undefined
  targetHr: number | null | undefined
  hasActivity: boolean
  movingSeconds: number | null | undefined
  avgPower: number | null | undefined
  normalizedPower: number | null | undefined
  intensityFactor: number | null | undefined
  avgHr: number | null | undefined
  laps?: CompareLap[] | null
}

export type SessionVerdict =
  | 'sin_salida'
  | 'como_prescripto'
  | 'mas_suave'
  | 'mas_duro'
  | 'mas_corto'
  | 'mas_largo'
  | 'calidad_fallida'

export type SessionCompareResult = {
  verdict: SessionVerdict
  label: string
  notes: string[]
}

const LABEL: Record<SessionVerdict, string> = {
  sin_salida: 'sin salida',
  como_prescripto: 'como lo prescripto',
  mas_suave: 'más suave',
  mas_duro: 'más duro',
  mas_corto: 'más corto',
  mas_largo: 'más largo',
  calidad_fallida: 'calidad incompleta',
}

const EASY_KINDS = new Set(['recovery', 'endurance', 'long'])

function isSessionKind(value: string | null | undefined): value is SessionKind {
  return Boolean(value && value in TEMPLATES)
}

function lapSeconds(lap: CompareLap): number {
  return lap.moving_seconds ?? lap.elapsed_seconds ?? 0
}

function lapEffort(laps: CompareLap[]): Array<'work' | 'rest'> {
  return classifyEffort(
    laps.map((lap) => ({ value: lap.avg_power ?? lap.avg_hr ?? null, intensity: lap.intensity }))
  )
}

function matchesPrescribedDuration(seconds: number, workMinutes: number): boolean {
  const target = workMinutes * 60
  return seconds >= target * 0.7 && seconds <= target * 1.3
}

/** Native laps whose duration already matches the prescribed work block. */
function countNativeWorkLaps(laps: CompareLap[], workMinutes: number): number {
  const efforts = lapEffort(laps)
  return laps.filter((lap, i) => efforts[i] === 'work' && matchesPrescribedDuration(lapSeconds(lap), workMinutes)).length
}

/**
 * Consecutive work seconds packed into the prescribed block length.
 * 1-min over-under laps inside a 10-min series count as one block, not 10 rests.
 */
function packWorkBlocks(laps: CompareLap[], workMinutes: number): number {
  const target = workMinutes * 60
  const efforts = lapEffort(laps)
  let packed = 0
  let acc = 0

  const flush = () => {
    if (acc >= target * 0.7) packed += Math.max(1, Math.round(acc / target))
    acc = 0
  }

  for (let i = 0; i < laps.length; i++) {
    if (efforts[i] === 'work') acc += lapSeconds(laps[i])
    else flush()
  }
  flush()
  return packed
}

export function countPrescribedBlocks(
  laps: CompareLap[],
  workMinutes: number
): { blocks: number; native: number; packed: number } {
  const native = countNativeWorkLaps(laps, workMinutes)
  const packed = packWorkBlocks(laps, workMinutes)
  return { blocks: Math.max(native, packed), native, packed }
}

/**
 * Deterministic prescribed-vs-executed read. The model narrates this; it
 * should not invent a different verdict.
 */
export function compareSession(input: SessionCompareInput): SessionCompareResult {
  if (!input.hasActivity || looksStrength(input.title, input.workoutType)) {
    return { verdict: 'sin_salida', label: LABEL.sin_salida, notes: [] }
  }

  const notes: string[] = []
  const executedMin =
    input.movingSeconds != null && input.movingSeconds > 0 ? input.movingSeconds / 60 : null
  const prescribedMin = input.durationMinutes != null && input.durationMinutes > 0 ? input.durationMinutes : null

  let durationLean: 'corto' | 'largo' | null = null
  if (prescribedMin != null && executedMin != null) {
    const ratio = executedMin / prescribedMin
    if (ratio < 0.75) durationLean = 'corto'
    else if (ratio > 1.2) durationLean = 'largo'
    notes.push(
      `duración ${Math.round(executedMin)} min vs ${Math.round(prescribedMin)} prescriptos (${Math.round(ratio * 100)}%)`
    )
  }

  const executedPower = input.normalizedPower ?? input.avgPower
  let intensityLean: 'suave' | 'duro' | null = null

  if (input.targetPower && executedPower) {
    const delta = (executedPower - input.targetPower) / input.targetPower
    notes.push(
      `potencia ${Math.round(executedPower)} W vs ${Math.round(input.targetPower)} W objetivo (${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}%)`
    )
    if (delta <= -0.08) intensityLean = 'suave'
    else if (delta >= 0.08) intensityLean = 'duro'
  } else if (input.targetHr && input.avgHr) {
    const delta = (input.avgHr - input.targetHr) / input.targetHr
    notes.push(
      `pulso ${Math.round(input.avgHr)} ppm vs ${Math.round(input.targetHr)} ppm objetivo (${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}%)`
    )
    if (delta <= -0.08) intensityLean = 'suave'
    else if (delta >= 0.08) intensityLean = 'duro'
  } else if (typeof input.intensityFactor === 'number' && isSessionKind(input.workoutType)) {
    const expected = TEMPLATES[input.workoutType].intensityFactor
    const delta = input.intensityFactor - expected
    notes.push(`IF ${input.intensityFactor.toFixed(2)} vs ${expected.toFixed(2)} típico de ${input.workoutType}`)
    if (delta <= -0.08) intensityLean = 'suave'
    else if (delta >= 0.08) intensityLean = 'duro'
  }

  if (EASY_KINDS.has(input.workoutType ?? '') && intensityLean === 'duro') {
    notes.push('la base se fue de zona: no es un estímulo extra, es un Z2 fallido')
  }

  const compact = parseCompactIntervals(input.title) ?? parseCompactIntervals(input.description)
  let missedIntervals = false
  if (compact && input.laps && input.laps.length >= 2) {
    const { blocks, native, packed } = countPrescribedBlocks(input.laps, compact.minutes)
    notes.push(
      packed > native
        ? `intervalos ${compact.repeats}×${compact.minutes} min · bloques de trabajo: ${blocks} (reconstruidos de ${input.laps.length} vueltas)`
        : `intervalos ${compact.repeats}×${compact.minutes} min · vueltas de trabajo: ${blocks}`
    )
    if (blocks <= compact.repeats - 2 || blocks === 0) missedIntervals = true
  }

  let verdict: SessionVerdict = 'como_prescripto'
  if (missedIntervals) verdict = 'calidad_fallida'
  else if (intensityLean === 'suave') verdict = 'mas_suave'
  else if (intensityLean === 'duro') verdict = 'mas_duro'
  else if (durationLean === 'corto') verdict = 'mas_corto'
  else if (durationLean === 'largo') verdict = 'mas_largo'

  return { verdict, label: LABEL[verdict], notes }
}

export function formatSessionComparison(result: SessionCompareResult): string[] {
  const lines = [`veredicto: ${result.label}`]
  for (const note of result.notes) lines.push(note)
  return lines
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function verdictLine(result: SessionCompareResult): string {
  const label = result.label
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}.`
}

/** True when the first line names this verdict and not a different one. */
export function firstLineMatchesVerdict(text: string, result: SessionCompareResult): boolean {
  const first = text.trim().split(/\r?\n/, 1)[0] ?? ''
  const folded = fold(first)
  if (!folded.includes(fold(result.label))) return false
  return !Object.values(LABEL).some(
    (label) => label !== result.label && folded.includes(fold(label))
  )
}

/**
 * The model narrates the review; the first line has to be the app's verdict.
 * If it softens or contradicts it, replace that line.
 */
export function pinReviewVerdict(text: string, result: SessionCompareResult): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  const canonical = verdictLine(result)
  if (!trimmed) return canonical
  if (firstLineMatchesVerdict(trimmed, result)) return trimmed

  const newline = trimmed.indexOf('\n')
  const rest = newline === -1 ? '' : trimmed.slice(newline + 1).trim()
  return rest ? `${canonical}\n${rest}` : canonical
}
