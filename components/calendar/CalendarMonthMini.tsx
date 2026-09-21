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
import { getBubbleSize, rideTone } from './calendar-utils'

type CalendarMonthMiniProps = {
  year: number
  month: number
  activities: CalendarActivity[]
  today?: Date
  loadScale?: number[]
  onHoverActivity?: (activity: CalendarActivity | null, pos?: { x: number; y: number }) => void
}

export function CalendarMonthMini({
  year,
  month,
  activities,
  today = new Date(),
  loadScale = [],
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
              loadScale={loadScale}
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
  loadScale,
  onHoverActivity,
}: {
  cell: MonthDayCell
  today: Date
  loadScale: number[]
  onHoverActivity?: CalendarMonthMiniProps['onHoverActivity']
}) {
  if (!cell.inMonth) {
    return <div className="min-h-[52px]" aria-hidden />
  }

  const isToday = isSameDay(cell.date, today)
  const dayActs = cell.activities
  const hasActivity = dayActs.length > 0
  const dayLoad = dayActs.reduce((sum, row) => sum + (row.training_load ?? 0), 0)

  return (
    <div className="flex min-h-[52px] flex-col items-center gap-0.5 py-0.5">
      <span
        className={`text-[10px] leading-none ${
          isToday
            ? 'font-bold text-accent-600 dark:text-accent-400'
            : hasActivity
              ? 'font-medium text-foreground'
              : 'text-muted'
        }`}
      >
        {cell.date.getDate()}
      </span>

      {!hasActivity && isToday && (
        <span className="text-[8px] font-bold text-accent-600 dark:text-accent-400">Hoy</span>
      )}

      {!hasActivity && !isToday && <span className="text-[8px] text-muted/40">·</span>}

      {dayActs.map((act) => (
        <ActivityBubble
          key={act.id}
          act={act}
          load={dayLoad}
          scale={loadScale}
          onHoverActivity={onHoverActivity}
        />
      ))}
    </div>
  )
}

function ActivityBubble({
  act,
  load,
  scale,
  onHoverActivity,
}: {
  act: CalendarActivity
  load: number
  scale: number[]
  onHoverActivity?: CalendarMonthMiniProps['onHoverActivity']
}) {
  const km = (act.distance_meters ?? 0) / 1000
  const tone = rideTone(load, scale)

  return (
    <Link href={`/activities/${act.id}`} className="flex flex-col items-center">
      <div
        className={`${getBubbleSize(km, 'mini')} ${tone.text} flex cursor-pointer flex-col items-center justify-center rounded-full font-semibold leading-none transition-all hover:ring-2 hover:ring-accent-400 hover:ring-offset-1`}
        style={{ backgroundColor: tone.fill }}
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
