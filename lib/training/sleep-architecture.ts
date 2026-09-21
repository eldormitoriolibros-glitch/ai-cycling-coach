/**
 * Night structure: how the hours were spent, not just how many there were.
 * A 8 h night that is mostly light + awake is a different recovery than 7 h
 * with a fat deep+REM block.
 *
 * Pure functions only.
 */
import { addDays, eachDay } from './dates'
import { mergeSleep, type SleepSourceRow } from './recovery-series'

export type SleepNight = {
  date: string
  deepHours: number
  remHours: number
  lightHours: number
  awakeHours: number
  /** (deep + REM) / time asleep. null when we only have a duration. */
  restorativeShare: number | null
}

export function nightFromSleep(row: SleepSourceRow): SleepNight | null {
  const deep = minutesToHours(row.deep_sleep_minutes)
  const rem = minutesToHours(row.rem_sleep_minutes)
  const awake = minutesToHours(row.awake_minutes)
  if (deep == null && rem == null && awake == null) return null

  const deepHours = deep ?? 0
  const remHours = rem ?? 0
  const awakeHours = awake ?? 0
  const staged = deepHours + remHours + awakeHours
  const totalHours =
    row.duration_minutes != null ? row.duration_minutes / 60 : staged
  const lightHours = Math.max(0, totalHours - staged)
  const asleep = deepHours + remHours + lightHours
  const restorativeShare = asleep > 0 ? (deepHours + remHours) / asleep : null

  return { date: row.date, deepHours, remHours, lightHours, awakeHours, restorativeShare }
}

export function buildSleepArchitecture(input: {
  today: string
  days?: number
  sleep: SleepSourceRow[]
}): SleepNight[] {
  const length = input.days ?? 28
  const from = addDays(input.today, -(length - 1))
  const byDate = mergeSleep(input.sleep)

  return eachDay(from, input.today).flatMap((date) => {
    const row = byDate.get(date)
    if (!row) return []
    const night = nightFromSleep(row)
    return night ? [night] : []
  })
}

export function meanRestorativeShare(nights: SleepNight[], last = 7): number | null {
  const recent = nights.filter((n) => n.restorativeShare != null).slice(-last)
  if (!recent.length) return null
  const sum = recent.reduce((acc, n) => acc + (n.restorativeShare ?? 0), 0)
  return sum / recent.length
}

function minutesToHours(value: number | null | undefined): number | null {
  return value == null ? null : value / 60
}
