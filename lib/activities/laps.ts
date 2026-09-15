import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export type ActivityLapRow = {
  lap_index: number
  start_offset_seconds: number | null
  elapsed_seconds: number | null
  moving_seconds: number | null
  distance_meters: number | null
  avg_speed: number | null
  max_speed: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_power: number | null
  max_power: number | null
  normalized_power: number | null
  elevation_gain_meters: number | null
  calories: number | null
  lap_trigger: string | null
  intensity: string | null
}

const LAP_SELECT =
  'lap_index, start_offset_seconds, elapsed_seconds, moving_seconds, distance_meters, avg_speed, max_speed, avg_hr, max_hr, avg_cadence, max_cadence, avg_power, max_power, normalized_power, elevation_gain_meters, calories, lap_trigger, intensity'

export async function loadActivityLaps(
  supabase: SupabaseClient<Database>,
  activityId: string
): Promise<ActivityLapRow[]> {
  const { data, error } = await supabase
    .from('activity_laps')
    .select(LAP_SELECT)
    .eq('activity_id', activityId)
    .order('lap_index', { ascending: true })

  if (error) throw error
  return (data ?? []) as ActivityLapRow[]
}

export type EffortHint = {
  value: number | null
  intensity?: string | null
}

/** Rest is clearly easy vs the hard parts of the ride (~<85% of the 75th percentile), not "a bit below the median". */
const REST_OF_HIGH_FRACTION = 0.85

function highEffortReference(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(sorted.length * 0.75)))
  return sorted[rank - 1]
}

/**
 * Splits laps into work and recovery. FIT `intensity` wins when present;
 * otherwise rest is only the clearly easy bits. Over-under "under" minutes
 * stay work: they sit well above Z1 even if they sit below the ride median.
 */
export function classifyEffort(hints: EffortHint[]): Array<'work' | 'rest'> {
  const threshold = highEffortReference(hints.map((h) => h.value).filter((v): v is number => v != null))

  return hints.map((hint) => {
    const declared = (hint.intensity ?? '').toLowerCase()
    if (declared === 'rest' || declared === 'recovery' || declared === 'warmup' || declared === 'cooldown') {
      return 'rest'
    }
    if (declared === 'active') return 'work'
    if (threshold == null || hint.value == null) return 'work'
    return hint.value < threshold * REST_OF_HIGH_FRACTION ? 'rest' : 'work'
  })
}

export function classifyLaps(laps: ActivityLapRow[]): Array<ActivityLapRow & { effort: 'work' | 'rest' }> {
  const efforts = classifyEffort(
    laps.map((lap) => ({ value: lap.avg_power ?? lap.avg_hr ?? null, intensity: lap.intensity }))
  )
  return laps.map((lap, i) => ({ ...lap, effort: efforts[i] }))
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export type LapSample = {
  offset_seconds: number
  power: number | null
  heart_rate: number | null
}

export type LapShape = {
  firstHalfPower: number | null
  secondHalfPower: number | null
  fadePct: number | null
  firstHalfHr: number | null
  secondHalfHr: number | null
  hrDrift: number | null
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function inWindow(samples: LapSample[], start: number, end: number, key: 'power' | 'heart_rate'): number[] {
  return samples
    .filter((s) => s.offset_seconds >= start && s.offset_seconds < end)
    .map((s) => s[key])
    .filter((v): v is number => v != null && Number.isFinite(v))
}

/**
 * How the block changed from first half to second half. Needs ~40s of samples
 * — shorter than that and the split is noise.
 */
export function analyzeLapShape(lap: ActivityLapRow, samples: LapSample[]): LapShape | null {
  const start = lap.start_offset_seconds ?? 0
  const duration = lap.moving_seconds ?? lap.elapsed_seconds ?? 0
  if (duration < 40 || samples.length === 0) return null

  const mid = start + duration / 2
  const end = start + duration
  const firstHalfPower = mean(inWindow(samples, start, mid, 'power'))
  const secondHalfPower = mean(inWindow(samples, mid, end, 'power'))
  const firstHalfHr = mean(inWindow(samples, start, mid, 'heart_rate'))
  const secondHalfHr = mean(inWindow(samples, mid, end, 'heart_rate'))

  const fadePct =
    firstHalfPower && secondHalfPower
      ? Math.round(((secondHalfPower - firstHalfPower) / firstHalfPower) * 100)
      : null
  const hrDrift =
    firstHalfHr != null && secondHalfHr != null ? Math.round(secondHalfHr - firstHalfHr) : null

  if (fadePct == null && hrDrift == null) return null
  return { firstHalfPower, secondHalfPower, fadePct, firstHalfHr, secondHalfHr, hrDrift }
}

function formatShape(shape: LapShape): string | null {
  const parts: string[] = []
  if (shape.fadePct != null && shape.firstHalfPower != null && shape.secondHalfPower != null) {
    const from = Math.round(shape.firstHalfPower)
    const to = Math.round(shape.secondHalfPower)
    if (Math.abs(shape.fadePct) >= 5) {
      parts.push(
        shape.fadePct < 0
          ? `cae ${Math.abs(shape.fadePct)}% (${from}→${to} W)`
          : `sube ${shape.fadePct}% (${from}→${to} W)`
      )
    } else {
      parts.push(`estable (${from}→${to} W)`)
    }
  }
  if (shape.hrDrift != null && Math.abs(shape.hrDrift) >= 4) {
    parts.push(shape.hrDrift > 0 ? `pulso +${shape.hrDrift} ppm` : `pulso ${shape.hrDrift} ppm`)
  }
  return parts.length ? parts.join(', ') : null
}

/**
 * Plain-text lap table for the coach prompt: this is the only way the model
 * can judge each interval instead of the ride average. When per-second samples
 * are available, each work block also gets first-half vs second-half shape.
 */
export function formatLapsForCoach(laps: ActivityLapRow[], samples: LapSample[] = []): string[] {
  if (laps.length < 2) return []

  const lines: string[] = []
  for (const lap of classifyLaps(laps)) {
    const parts = [
      `vuelta ${lap.lap_index} (${lap.effort === 'work' ? 'trabajo' : 'recuperación'})`,
      fmtDuration(lap.moving_seconds ?? lap.elapsed_seconds),
    ]
    if (lap.distance_meters) parts.push(`${(lap.distance_meters / 1000).toFixed(2)} km`)
    if (lap.avg_power) parts.push(`${Math.round(lap.avg_power)} W`)
    if (lap.normalized_power) parts.push(`NP ${Math.round(lap.normalized_power)} W`)
    if (lap.avg_hr) parts.push(`${lap.avg_hr} ppm`)
    if (lap.max_hr) parts.push(`máx ${lap.max_hr} ppm`)
    if (lap.avg_cadence) parts.push(`cad ${lap.avg_cadence} rpm`)
    if (lap.avg_speed) parts.push(`${(lap.avg_speed * 3.6).toFixed(1)} km/h`)
    if (lap.effort === 'work' && samples.length) {
      const analyzed = analyzeLapShape(lap, samples)
      const shape = analyzed ? formatShape(analyzed) : null
      if (shape) parts.push(shape)
    }
    lines.push(`- ${parts.join(' · ')}`)
  }
  return lines
}
