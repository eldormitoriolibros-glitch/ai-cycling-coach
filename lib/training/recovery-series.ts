import { addDays, eachDay } from './dates'

export type SleepSourceRow = {
  date: string
  source?: string | null
  duration_minutes: number | null
  sleep_score: number | null
  deep_sleep_minutes?: number | null
  rem_sleep_minutes?: number | null
  awake_minutes?: number | null
}

export type RecoverySourceRow = {
  date: string
  source?: string | null
  resting_hr?: number | null
  hrv?: number | null
  soreness?: number | null
  motivation?: number | null
  body_battery_high?: number | null
}

export type RecoveryDayPoint = {
  date: string
  sleepHours: number | null
  sleepScore: number | null
  restingHr: number | null
  hrv: number | null
  soreness: number | null
  motivation: number | null
  bodyBattery: number | null
}

const EMPTY_DAY = {
  sleepHours: null,
  sleepScore: null,
  restingHr: null,
  hrv: null,
  soreness: null,
  motivation: null,
  bodyBattery: null,
} satisfies Omit<RecoveryDayPoint, 'date'>

function prefersManual<T extends { source?: string | null }>(current: T | undefined, row: T): boolean {
  if (!current) return true
  return row.source === 'manual' && current.source !== 'manual'
}

function firstNumber(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  return a != null ? a : b ?? null
}

export function mergeSleep(rows: SleepSourceRow[]): Map<string, SleepSourceRow> {
  const byDate = new Map<string, SleepSourceRow>()
  for (const row of rows) {
    const current = byDate.get(row.date)
    if (!current) {
      byDate.set(row.date, row)
      continue
    }
    // Manual hours win; Garmin stages fill in when the check-in left them empty.
    const manualHours = row.source === 'manual' && row.duration_minutes != null
    byDate.set(row.date, {
      date: row.date,
      source: manualHours ? row.source : current.source,
      duration_minutes: manualHours
        ? row.duration_minutes
        : firstNumber(current.duration_minutes, row.duration_minutes),
      sleep_score:
        manualHours && row.sleep_score != null
          ? row.sleep_score
          : firstNumber(current.sleep_score, row.sleep_score),
      deep_sleep_minutes: firstNumber(current.deep_sleep_minutes, row.deep_sleep_minutes),
      rem_sleep_minutes: firstNumber(current.rem_sleep_minutes, row.rem_sleep_minutes),
      awake_minutes: firstNumber(current.awake_minutes, row.awake_minutes),
    })
  }
  return byDate
}

function mergeRecovery(rows: RecoverySourceRow[]): Map<string, RecoverySourceRow> {
  const byDate = new Map<string, RecoverySourceRow>()
  for (const row of rows) {
    const current = byDate.get(row.date)
    if (prefersManual(current, row)) byDate.set(row.date, row)
  }
  return byDate
}

function pointFor(
  date: string,
  sleep: SleepSourceRow | undefined,
  recovery: RecoverySourceRow | undefined
): RecoveryDayPoint {
  return {
    date,
    sleepHours: sleep?.duration_minutes != null ? sleep.duration_minutes / 60 : null,
    sleepScore: sleep?.sleep_score ?? null,
    restingHr: recovery?.resting_hr ?? null,
    hrv: recovery?.hrv == null ? null : Number(recovery.hrv),
    soreness: recovery?.soreness ?? null,
    motivation: recovery?.motivation ?? null,
    bodyBattery: recovery?.body_battery_high ?? null,
  }
}

export function hasMorningCheckIn(point: RecoveryDayPoint): boolean {
  return (
    point.sleepHours != null ||
    point.sleepScore != null ||
    point.restingHr != null ||
    point.hrv != null ||
    point.soreness != null ||
    point.motivation != null
  )
}

/**
 * Continuous day series ending on `today`. Manual rows win over Garmin when
 * both exist for the same date.
 */
export function buildRecoverySeries(input: {
  today: string
  days?: number
  sleep: SleepSourceRow[]
  recovery: RecoverySourceRow[]
}): { series: RecoveryDayPoint[]; todayPoint: RecoveryDayPoint; loggedToday: boolean } {
  const length = input.days ?? 14
  const from = addDays(input.today, -(length - 1))
  const sleepByDate = mergeSleep(input.sleep)
  const recoveryByDate = mergeRecovery(input.recovery)

  const series = eachDay(from, input.today).map((date) =>
    pointFor(date, sleepByDate.get(date), recoveryByDate.get(date))
  )
  const todayPoint = series[series.length - 1] ?? { date: input.today, ...EMPTY_DAY }

  return { series, todayPoint, loggedToday: hasMorningCheckIn(todayPoint) }
}
