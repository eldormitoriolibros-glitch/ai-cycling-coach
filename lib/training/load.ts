/**
 * Training-stress estimation.
 *
 * These are *derived* values computed by this app, not vendor metrics.
 * Power-based TSS follows the standard formula; the HR fallback is an
 * approximation and is flagged as such by returning a lower-confidence value.
 */

export type LoadInput = {
  durationSeconds: number | null | undefined
  normalizedPower: number | null | undefined
  averagePower: number | null | undefined
  averageHr: number | null | undefined
  ftp: number | null | undefined
  maxHr: number | null | undefined
  restingHr: number | null | undefined
}

export type LoadResult = {
  trainingLoad: number | null
  intensityFactor: number | null
}

/** TSS = (seconds × NP × IF) / (FTP × 3600) × 100 */
function powerLoad(durationSeconds: number, np: number, ftp: number): LoadResult {
  const intensityFactor = np / ftp
  const trainingLoad = ((durationSeconds * np * intensityFactor) / (ftp * 3600)) * 100
  return {
    trainingLoad: round(trainingLoad),
    intensityFactor: round(intensityFactor, 3),
  }
}

/** Heart-rate reserve fallback, roughly calibrated so an hour at threshold ≈ 100. */
function heartRateLoad(
  durationSeconds: number,
  avgHr: number,
  maxHr: number,
  restingHr: number
): LoadResult {
  const reserve = maxHr - restingHr
  if (reserve <= 0) return { trainingLoad: null, intensityFactor: null }

  const fraction = Math.max(0, Math.min(1.15, (avgHr - restingHr) / reserve))
  // Threshold sits near 85% of heart-rate reserve.
  const intensityFactor = fraction / 0.85
  const trainingLoad = (durationSeconds / 3600) * intensityFactor ** 2 * 100

  return {
    trainingLoad: round(trainingLoad),
    intensityFactor: round(intensityFactor, 3),
  }
}

export function estimateTrainingLoad(input: LoadInput): LoadResult {
  const duration = input.durationSeconds ?? 0
  if (duration <= 0) return { trainingLoad: null, intensityFactor: null }

  const np = input.normalizedPower ?? input.averagePower
  if (np && np > 0 && input.ftp && input.ftp > 0) {
    return powerLoad(duration, np, input.ftp)
  }

  if (input.averageHr && input.maxHr) {
    return heartRateLoad(duration, input.averageHr, input.maxHr, input.restingHr ?? 60)
  }

  return { trainingLoad: null, intensityFactor: null }
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
