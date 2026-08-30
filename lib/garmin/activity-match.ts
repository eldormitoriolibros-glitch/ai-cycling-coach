import type { ParsedFitActivity } from './fit'

const TIME_TOLERANCE_MS = 5 * 60 * 1000
/** Distance+duration matching still requires start times to be close. */
const DISTANCE_MATCH_MAX_TIME_MS = 30 * 60 * 1000
const DURATION_TOLERANCE_S = 300
const DISTANCE_TOLERANCE_RATIO = 0.015
const DISTANCE_TOLERANCE_MIN_M = 250

export type ExistingActivity = {
  id: string
  title: string | null
  start_time: string
  duration_seconds: number | null
  moving_seconds: number | null
  distance_meters: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_power: number | null
  max_power: number | null
  avg_speed: number | null
  max_speed: number | null
  elevation_gain_meters: number | null
  avg_temperature: number | null
  max_temperature: number | null
  training_effect_aerobic: number | null
  training_effect_anaerobic: number | null
  avg_respiration_rate: number | null
  calories: number | null
  sweat_loss_ml: number | null
  garmin_training_load: number | null
  has_power_meter: boolean
  kilojoules: number | null
  training_load: number | null
}

/** Finds the best existing activity for a parsed FIT session, or null. */
export function findMatch(
  fit: ParsedFitActivity,
  candidates: ExistingActivity[],
  taken: Set<string>
): { activity: ExistingActivity; via: 'time' | 'distance+duration'; score: number } | null {
  const fitStart = new Date(fit.startTime).getTime()
  if (Number.isNaN(fitStart)) return null

  let best: ExistingActivity | null = null
  let bestScore = Infinity
  let bestVia: 'time' | 'distance+duration' = 'time'

  for (const act of candidates) {
    if (taken.has(act.id)) continue
    const actStart = new Date(act.start_time).getTime()

    const timeDelta = Math.abs(actStart - fitStart)
    if (timeDelta <= TIME_TOLERANCE_MS) {
      const score = timeDelta / TIME_TOLERANCE_MS
      if (score < bestScore) {
        best = act
        bestScore = score
        bestVia = 'time'
      }
      continue
    }

    const fitDist = fit.distanceMeters
    const actDist = act.distance_meters
    const fitDur = fit.durationSeconds
    const actDur = act.moving_seconds ?? act.duration_seconds

    if (fitDist != null && actDist != null && fitDur != null && actDur != null) {
      if (timeDelta > DISTANCE_MATCH_MAX_TIME_MS) continue

      const distDelta = Math.abs(actDist - fitDist)
      const durDelta = Math.abs(actDur - fitDur)
      const distAllowed = Math.max(DISTANCE_TOLERANCE_MIN_M, fitDist * DISTANCE_TOLERANCE_RATIO)

      if (distDelta <= distAllowed && durDelta <= DURATION_TOLERANCE_S) {
        const score = 1 + distDelta / distAllowed + durDelta / DURATION_TOLERANCE_S
        if (score < bestScore) {
          best = act
          bestScore = score
          bestVia = 'distance+duration'
        }
      }
    }
  }

  return best ? { activity: best, via: bestVia, score: bestScore } : null
}

/** Only matches by start time (±5 min). Used when a Garmin id has no row yet. */
export function findTimeMatch(
  fit: ParsedFitActivity,
  candidates: ExistingActivity[],
  taken: Set<string>
): ExistingActivity | null {
  const fitStart = new Date(fit.startTime).getTime()
  if (Number.isNaN(fitStart)) return null

  let best: ExistingActivity | null = null
  let bestScore = Infinity

  for (const act of candidates) {
    if (taken.has(act.id)) continue
    const timeDelta = Math.abs(new Date(act.start_time).getTime() - fitStart)
    if (timeDelta <= TIME_TOLERANCE_MS) {
      const score = timeDelta / TIME_TOLERANCE_MS
      if (score < bestScore) {
        best = act
        bestScore = score
      }
    }
  }

  return best
}
