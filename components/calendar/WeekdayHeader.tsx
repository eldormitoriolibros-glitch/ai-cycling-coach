'use client'

import { DAY_LABELS } from '@/lib/calendar/weeks'
import { CALENDAR_WEEK_GRID, CALENDAR_WEEK_GRID_COMPACT } from './calendar-utils'

type WeekdayHeaderProps = {
  today?: Date
  compact?: boolean
  withSideColumns?: boolean
}

function todayMondayIndex(today: Date): number {
  return (today.getDay() + 6) % 7
}

export function WeekdayHeader({ today, compact = false, withSideColumns = false }: WeekdayHeaderProps) {
  const todayIdx = today ? todayMondayIndex(today) : -1
  const grid = withSideColumns ? CALENDAR_WEEK_GRID : CALENDAR_WEEK_GRID_COMPACT

  return (
    <div className={`${grid} pb-1.5`}>
      {withSideColumns && <div className="hidden md:block" />}
      {DAY_LABELS.map((d, i) => {
        const isToday = i === todayIdx
        return (
          <div
            key={d}
            className={`min-w-0 text-center font-semibold uppercase tracking-wide ${
              isToday ? 'text-orange-500' : 'text-muted'
            } ${compact ? 'text-[10px]' : 'text-[10px] sm:text-xs'}`}
          >
            {isToday && (
              <span className="mb-0.5 block text-[8px] font-bold leading-none tracking-normal">Hoy</span>
            )}
            {d}
          </div>
        )
      })}
      {withSideColumns && <div className="hidden md:block" />}
    </div>
  )
}
