import type { CalendarActivity, WeekData } from './types'

export const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

export function getMonday(d: Date): Date {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

export function getSunday(d: Date): Date {
  const monday = getMonday(d)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return sunday
}

export function formatWeekLabel(weekStart: Date, weekEnd: Date): string {
  const startDay = weekStart.getDate()
  const endDay = weekEnd.getDate()
  const startMonth = weekStart.toLocaleDateString('es-AR', { month: 'short' })
  const endMonth = weekEnd.toLocaleDateString('es-AR', { month: 'short' })
  return startMonth === endMonth
    ? `${startDay} – ${endDay} de ${startMonth}`
    : `${startDay} de ${startMonth} – ${endDay} de ${endMonth}`
}

export function buildWeeksInRange(
  activities: CalendarActivity[],
  rangeStart: Date,
  rangeEnd: Date
): WeekData[] {
  const firstMonday = getMonday(rangeStart)
  const lastSunday = getSunday(rangeEnd)

  const weeks: WeekData[] = []
  const current = new Date(firstMonday)

  while (current <= lastSunday) {
    const weekStart = new Date(current)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const dayMap = new Map<number, CalendarActivity[]>()
    for (let d = 0; d < 7; d++) dayMap.set(d, [])

    let totalDistance = 0
    let totalSeconds = 0

    for (const act of activities) {
      const actDate = new Date(act.start_time)
      if (actDate >= weekStart && actDate <= weekEnd) {
        const dayOfWeek = actDate.getDay()
        const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        dayMap.get(idx)!.push(act)
        totalDistance += act.distance_meters ?? 0
        totalSeconds += act.moving_seconds ?? act.duration_seconds ?? 0
      }
    }

    weeks.push({
      startDate: weekStart,
      endDate: weekEnd,
      label: formatWeekLabel(weekStart, weekEnd),
      totalDistance,
      totalSeconds,
      activities: dayMap,
    })
    current.setDate(current.getDate() + 7)
  }

  return weeks
}

export function buildWeeksForMonth(
  activities: CalendarActivity[],
  year: number,
  month: number
): WeekData[] {
  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  return buildWeeksInRange(activities, firstOfMonth, lastOfMonth)
}

export function getMonthRange(year: number, month: number) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
  }
}

export function getSixMonthRange(endYear: number, endMonth: number) {
  const end = new Date(endYear, endMonth + 1, 0)
  const start = new Date(endYear, endMonth - 5, 1)
  return { start, end }
}

export function getYearRange(year: number) {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
  }
}

export function formatCalendarTitle(mode: 'month' | '6months' | 'year', year: number, month: number): string {
  if (mode === 'year') return String(year)
  if (mode === '6months') {
    const { start, end } = getSixMonthRange(year, month)
    const startLabel = start.toLocaleDateString('es-AR', { month: 'short' })
    const endLabel = end.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    return `${startLabel} – ${endLabel}`
  }
  return new Date(year, month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`
}

export function formatMonthHeading(date: Date): string {
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
