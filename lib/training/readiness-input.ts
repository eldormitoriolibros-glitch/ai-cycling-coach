import { computeReadiness, type ReadinessInput, type ReadinessResult } from './readiness'

export type RecoveryRow = {
  resting_hr: number | null
  hrv: number | null
  stress: number | null
  soreness: number | null
  motivation: number | null
  body_battery_high?: number | null
  spo2_avg?: number | null
}

export type SleepRow = {
  duration_minutes: number | null
  sleep_score: number | null
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/**
 * Builds the readiness input from the last week of recovery and sleep rows.
 * Baselines are the athlete's own recent average, so a resting HR of 55 means
 * something different for each person. Rows must be newest-first.
 */
export function buildReadinessInput(input: {
  form: number | null
  recovery: RecoveryRow[]
  sleep: SleepRow[]
}): ReadinessInput {
  const latestRecovery = input.recovery[0] ?? null
  const latestSleep = input.sleep[0] ?? null

  return {
    form: input.form,
    restingHr: latestRecovery?.resting_hr ?? null,
    baselineRestingHr: average(
      input.recovery.map((r) => r.resting_hr).filter((v): v is number => v != null)
    ),
    hrv: latestRecovery?.hrv == null ? null : Number(latestRecovery.hrv),
    baselineHrv: average(
      input.recovery
        .map((r) => (r.hrv == null ? null : Number(r.hrv)))
        .filter((v): v is number => v != null && Number.isFinite(v))
    ),
    sleepHours: latestSleep?.duration_minutes ? latestSleep.duration_minutes / 60 : null,
    sleepScore: latestSleep?.sleep_score ?? null,
    soreness: latestRecovery?.soreness ?? null,
    motivation: latestRecovery?.motivation ?? null,
    bodyBattery: latestRecovery?.body_battery_high ?? null,
    stressAvg: latestRecovery?.stress ?? null,
    spo2: latestRecovery?.spo2_avg ?? null,
  }
}

export function readinessFrom(input: {
  form: number | null
  recovery: RecoveryRow[]
  sleep: SleepRow[]
}): ReadinessResult {
  return computeReadiness(buildReadinessInput(input))
}
