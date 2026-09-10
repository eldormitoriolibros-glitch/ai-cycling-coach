/**
 * Training-stress estimation.
 *
 * These are *derived* values computed by this app, not vendor metrics.
 * Power-based TSS comes first; heart-rate reserve is next; duration-only
 * endurance (IF 0.65) fills rides that have neither sensor so the CTL
 * series can start from the first stored activity, not from the first
 * day someone typed FTP or recovery by hand.
 */

const DEFAULT_MAX_HR = 190
const DEFAULT_ENDURANCE_IF = 0.65
const MIN_DURATION_FOR_DURATION_LOAD = 10 * 60

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

  if (input.averageHr && input.averageHr > 0) {
    const maxHr = input.maxHr && input.maxHr > 0 ? input.maxHr : DEFAULT_MAX_HR
    return heartRateLoad(duration, input.averageHr, maxHr, input.restingHr ?? 60)
  }

  if (duration >= MIN_DURATION_FOR_DURATION_LOAD) {
    return durationLoad(duration)
  }

  return { trainingLoad: null, intensityFactor: null }
}

/** Typical endurance hour ≈ 42 TSS when we only know how long the ride lasted. */
function durationLoad(durationSeconds: number): LoadResult {
  const hours = durationSeconds / 3600
  return {
    trainingLoad: round(hours * DEFAULT_ENDURANCE_IF ** 2 * 100),
    intensityFactor: DEFAULT_ENDURANCE_IF,
  }
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
