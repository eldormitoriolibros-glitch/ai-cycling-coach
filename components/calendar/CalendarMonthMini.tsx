'use client'

import Link from 'next/link'
import type { CalendarActivity } from '@/lib/calendar/types'
import {
  buildMonthGrid,
  DAY_LETTERS,
  formatMonthTitle,
  groupActivitiesByDay,
  type MonthDayCell,
} from '@/lib/calendar/month-grid'
import { isSameDay } from '@/lib/calendar/weeks'
import { formatCalendarDistance, formatCalendarDuration, formatKmBubble } from '@/lib/calendar/format'
import { getActivityColor, getBubbleSize } from './calendar-utils'

type CalendarMonthMiniProps = {
  year: number
  month: number
  activities: CalendarActivity[]
  today?: Date
  onHoverActivity?: (activity: CalendarActivity | null, pos?: { x: number; y: number }) => void
}

export function CalendarMonthMini({
  year,
  month,
  activities,
  today = new Date(),
  onHoverActivity,
}: CalendarMonthMiniProps) {
  const byDay = groupActivitiesByDay(activities)
  const grid = buildMonthGrid(year, month, byDay)

  return (
    <div className="flex flex-col gap-2">
      <div className="text-center">
        <h3 className="text-sm font-bold tracking-wide text-foreground">{formatMonthTitle(year, month)}</h3>
        {grid.totalDistance > 0 && (
          <p className="text-[10px] text-muted mt-0.5">
            {formatCalendarDistance(grid.totalDistance)}
            {grid.totalSeconds > 0 && ` · ${formatCalendarDuration(grid.totalSeconds)}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-7 gap-x-0.5 gap-y-1 text-center">
        {DAY_LETTERS.map((letter, i) => (
          <span key={`${letter}-${i}`} className="text-[10px] font-medium text-muted">
            {letter}
          </span>
        ))}

        {grid.weeks.flatMap((week, wi) =>
          week.map((cell, di) => (
            <MonthDay
              key={`${wi}-${di}`}
              cell={cell}
              today={today}
              onHoverActivity={onHoverActivity}
            />
          ))
        )}
      </div>
    </div>
  )
}

function MonthDay({
  cell,
  today,
  onHoverActivity,
}: {
  cell: MonthDayCell
  today: Date
  onHoverActivity?: CalendarMonthMiniProps['onHoverActivity']
}) {
  if (!cell.inMonth) {
    return <div className="min-h-[52px]" aria-hidden />
  }

  const isToday = isSameDay(cell.date, today)
  const dayActs = cell.activities
  const hasActivity = dayActs.length > 0

  return (
    <div className="flex min-h-[52px] flex-col items-center gap-0.5 py-0.5">
      <span
        className={`text-[10px] leading-none ${
          isToday ? 'font-bold text-orange-500' : hasActivity ? 'font-medium text-foreground' : 'text-muted'
        }`}
      >
        {cell.date.getDate()}
      </span>

      {!hasActivity && isToday && (
        <span className="text-[8px] font-bold text-orange-500">Hoy</span>
      )}

      {!hasActivity && !isToday && <span className="text-[8px] text-muted/40">·</span>}

      {dayActs.map((act) => (
        <ActivityBubble
          key={act.id}
          act={act}
          onHoverActivity={onHoverActivity}
        />
      ))}
    </div>
  )
}

function ActivityBubble({
  act,
  onHoverActivity,
}: {
  act: CalendarActivity
  onHoverActivity?: CalendarMonthMiniProps['onHoverActivity']
}) {
  const km = (act.distance_meters ?? 0) / 1000

  return (
    <Link href={`/activities/${act.id}`} className="flex flex-col items-center">
      <div
        className={`${getActivityColor(act.sport_type)} ${getBubbleSize(km, 'mini')} rounded-full flex flex-col items-center justify-center text-white font-semibold cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-orange-400 transition-all leading-none`}
        onMouseEnter={(e) => onHoverActivity?.(act, { x: e.clientX, y: e.clientY })}
        onMouseLeave={() => onHoverActivity?.(null)}
        title={act.title ?? formatCalendarDistance(act.distance_meters)}
      >
        {km >= 1 && (
          <>
            <span className="tabular-nums">{formatKmBubble(act.distance_meters)}</span>
            <span className="text-[5px] font-medium opacity-90">km</span>
          </>
        )}
      </div>
    </Link>
  )
}
