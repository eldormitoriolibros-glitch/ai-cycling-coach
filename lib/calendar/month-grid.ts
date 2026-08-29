import type { CalendarActivity } from './types'
import { getMonday, getSunday } from './weeks'

export const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

export type MonthDayCell = {
  date: Date
  inMonth: boolean
  activities: CalendarActivity[]
  totalDistance: number
  totalSeconds: number
}

export type MonthGrid = {
  year: number
  month: number
  weeks: MonthDayCell[][]
  totalDistance: number
  totalSeconds: number
  activityCount: number
}

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function groupActivitiesByDay(activities: CalendarActivity[]): Map<string, CalendarActivity[]> {
  const map = new Map<string, CalendarActivity[]>()
  for (const act of activities) {
    const key = dateKey(new Date(act.start_time))
    const list = map.get(key) ?? []
    list.push(act)
    map.set(key, list)
  }
  return map
}

export function getMonthsInRange(start: Date, end: Date): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= last) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export function buildMonthGrid(
  year: number,
  month: number,
  activitiesByDay: Map<string, CalendarActivity[]>
): MonthGrid {
  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  const gridStart = getMonday(firstOfMonth)
  const gridEnd = getSunday(lastOfMonth)

  let totalDistance = 0
  let totalSeconds = 0
  let activityCount = 0
  const weeks: MonthDayCell[][] = []

  const cursor = new Date(gridStart)
  while (cursor <= gridEnd) {
    const week: MonthDayCell[] = []
    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(cursor)
      cellDate.setDate(cursor.getDate() + i)
      const inMonth = cellDate.getMonth() === month
      const key = dateKey(cellDate)
      const dayActs = inMonth ? (activitiesByDay.get(key) ?? []) : []
      let dayDistance = 0
      let daySeconds = 0
      for (const act of dayActs) {
        dayDistance += act.distance_meters ?? 0
        daySeconds += act.moving_seconds ?? act.duration_seconds ?? 0
      }
      if (inMonth && dayActs.length > 0) {
        totalDistance += dayDistance
        totalSeconds += daySeconds
        activityCount += dayActs.length
      }
      week.push({
        date: cellDate,
        inMonth,
        activities: dayActs,
        totalDistance: dayDistance,
        totalSeconds: daySeconds,
      })
    }
    weeks.push(week)
    cursor.setDate(cursor.getDate() + 7)
  }

  return { year, month, weeks, totalDistance, totalSeconds, activityCount }
}

export function formatMonthTitle(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString('es-AR', { month: 'long' }).toUpperCase()
}
