import type { PowerCurve } from '@/lib/types/database'

/** Durations (seconds) tracked on the mean-maximal power curve. */
export const CURVE_DURATIONS = [5, 15, 60, 300, 480, 1200, 3600] as const

/**
 * Best average power sustained over each duration, via prefix sums.
 * Gaps in the stream count as zero watts, which is what Strava records when
 * you coast, so the window stays time-accurate.
 */
export function computePowerCurve(
  watts: Array<number | null>,
  durations: readonly number[] = CURVE_DURATIONS
): PowerCurve {
  const n = watts.length
  if (n === 0) return {}

  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + (watts[i] ?? 0)
  }

  const curve: PowerCurve = {}

  for (const duration of durations) {
    if (duration > n) continue

    let best = 0
    for (let start = 0; start + duration <= n; start++) {
      const mean = (prefix[start + duration] - prefix[start]) / duration
      if (mean > best) best = mean
    }

    if (best > 0) curve[String(duration)] = Math.round(best)
  }

  return curve
}

export function bestFor(curve: PowerCurve | null | undefined, duration: number): number | null {
  const value = curve?.[String(duration)]
  return typeof value === 'number' && value > 0 ? value : null
}

/**
 * Normalized Power: 4th root of the mean of the 30-second rolling average
 * raised to the 4th power. Computed here because Strava only exposes its own
 * `weighted_average_watts` on detailed activities recorded with a real power
 * meter — never on the list endpoint, and never for estimated power.
 */
export function computeNormalizedPower(
  watts: Array<number | null>,
  windowSeconds = 30
): number | null {
  const n = watts.length
  if (n < windowSeconds) return null

  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + (watts[i] ?? 0)
  }

  let sumOfFourths = 0
  let windows = 0

  for (let start = 0; start + windowSeconds <= n; start++) {
    const mean = (prefix[start + windowSeconds] - prefix[start]) / windowSeconds
    sumOfFourths += mean ** 4
    windows++
  }

  if (windows === 0) return null

  const np = (sumOfFourths / windows) ** 0.25
  return np > 0 ? Math.round(np) : null
}

export function maxPower(watts: Array<number | null>): number | null {
  let best = 0
  for (const value of watts) {
    if (typeof value === 'number' && value > best) best = value
  }
  return best > 0 ? Math.round(best) : null
}

/** Merges curves from several rides, keeping the best value per duration. */
export function mergeCurves(curves: Array<PowerCurve | null | undefined>): PowerCurve {
  const merged: PowerCurve = {}

  for (const curve of curves) {
    if (!curve) continue
    for (const [duration, watts] of Object.entries(curve)) {
      if (typeof watts !== 'number') continue
      if (!merged[duration] || watts > merged[duration]) merged[duration] = watts
    }
  }

  return merged
}
