'use client'

import Link from 'next/link'
import type { CalendarActivity, WeekData } from '@/lib/calendar/types'
import { isSameDay } from '@/lib/calendar/weeks'
import {
  formatCalendarDistance,
  formatCalendarDuration,
  formatCalendarDurationLong,
  formatKmBubble,
} from '@/lib/calendar/format'
import {
  CALENDAR_WEEK_GRID,
  CALENDAR_WEEK_GRID_COMPACT,
  getActivityColor,
  getBubbleSize,
} from './calendar-utils'

type CalendarWeekRowProps = {
  week: WeekData
  compact?: boolean
  showWeekLabel?: boolean
  showSummaryBar?: boolean
  showDayNumbers?: boolean
  maxWeekDistance?: number
  today?: Date
  onHoverActivity?: (activity: CalendarActivity | null, pos?: { x: number; y: number }) => void
}

export function CalendarWeekRow({
  week,
  compact = false,
  showWeekLabel = true,
  showSummaryBar = true,
  showDayNumbers = false,
  maxWeekDistance = 0,
  today = new Date(),
  onHoverActivity,
}: CalendarWeekRowProps) {
  const gridCols = compact ? CALENDAR_WEEK_GRID_COMPACT : CALENDAR_WEEK_GRID
  const barWidth =
    maxWeekDistance > 0 && week.totalDistance > 0
      ? Math.max(28, Math.round((week.totalDistance / maxWeekDistance) * 100))
      : 100

  return (
    <div className={compact ? 'py-1.5' : 'py-3 md:py-4'}>
      {showWeekLabel && (
        <div className="mb-2 flex items-baseline justify-between gap-3 md:hidden">
          <p className="min-w-0 text-xs font-medium leading-snug text-muted">{week.label}</p>
          {week.totalDistance > 0 && (
            <p className="shrink-0 text-xs font-bold tabular-nums text-orange-500">
              {formatCalendarDistance(week.totalDistance)}
              {week.totalSeconds > 0 && (
                <span className="font-medium text-muted"> · {formatCalendarDuration(week.totalSeconds)}</span>
              )}
            </p>
          )}
        </div>
      )}

      <div className={`${gridCols} items-start`}>
        {showWeekLabel && (
          <div className="hidden space-y-0.5 pr-3 pt-1 text-right md:block">
            <p className="text-xs font-medium text-muted">{week.label}</p>
            {week.totalDistance > 0 && (
              <>
                <p className="text-base font-bold tabular-nums text-orange-500">
                  {formatCalendarDistance(week.totalDistance)}
                </p>
                {week.totalSeconds > 0 && (
                  <p className="text-[11px] tabular-nums text-muted">{formatCalendarDuration(week.totalSeconds)}</p>
                )}
              </>
            )}
          </div>
        )}

        {Array.from({ length: 7 }, (_, dayIdx) => {
          const dayDate = new Date(week.startDate)
          dayDate.setDate(dayDate.getDate() + dayIdx)
          const dayActs = week.activities.get(dayIdx) ?? []
          const isToday = isSameDay(dayDate, today)

          return (
            <DayCell
              key={dayIdx}
              dayDate={dayDate}
              activities={dayActs}
              isToday={isToday}
              compact={compact}
              showDayNumbers={showDayNumbers}
              onHoverActivity={onHoverActivity}
            />
          )
        })}

        {showSummaryBar && (
          <div className="hidden min-w-0 justify-start pl-2 md:flex">
            {week.totalDistance > 0 && (
              <div
                className="flex min-h-[44px] min-w-0 flex-col justify-center rounded-md bg-orange-100 px-2.5 py-1.5 dark:bg-orange-950/40"
                style={{ width: `${barWidth}%`, maxWidth: '100%' }}
              >
                <span className="text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400">
                  {formatCalendarDistance(week.totalDistance)}
                </span>
                {week.totalSeconds > 0 && (
                  <span className="text-[10px] tabular-nums text-orange-700/80 dark:text-orange-300/80">
                    {formatCalendarDurationLong(week.totalSeconds)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DayCell({
  dayDate,
  activities,
  isToday,
  compact,
  showDayNumbers,
  onHoverActivity,
}: {
  dayDate: Date
  activities: CalendarActivity[]
  isToday: boolean
  compact: boolean
  showDayNumbers: boolean
  onHoverActivity?: CalendarWeekRowProps['onHoverActivity']
}) {
  const visible = activities.slice(0, 2)
  const extra = activities.length - visible.length

  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-start gap-0.5 px-0.5 ${
        compact ? 'min-h-[36px]' : 'min-h-[52px] md:min-h-[72px]'
      } ${isToday ? 'rounded-lg bg-orange-500/10 py-1' : 'py-1'}`}
    >
      {showDayNumbers && (
        <span
          className={`flex h-5 w-5 items-center justify-center text-[11px] leading-none ${
            isToday
              ? 'rounded-full bg-orange-500 font-bold text-white'
              : activities.length > 0
                ? 'font-medium text-foreground'
                : 'text-muted'
          }`}
        >
          {dayDate.getDate()}
        </span>
      )}

      {visible.length === 0 && (
        <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isToday ? 'bg-orange-500' : 'bg-slate-500/40'}`} />
      )}

      {visible.map((act) => (
        <ActivityMark key={act.id} act={act} compact={compact} onHoverActivity={onHoverActivity} />
      ))}

      {extra > 0 && <span className="text-[9px] font-medium text-muted">+{extra}</span>}

      {!compact && activities[0] && (
        <span className="mt-0.5 hidden max-w-full truncate px-0.5 text-center text-[9px] text-muted md:block">
          {activities[0].title ?? activities[0].sport_type ?? ''}
        </span>
      )}
    </div>
  )
}

function ActivityMark({
  act,
  compact,
  onHoverActivity,
}: {
  act: CalendarActivity
  compact: boolean
  onHoverActivity?: CalendarWeekRowProps['onHoverActivity']
}) {
  const km = (act.distance_meters ?? 0) / 1000
  const color = getActivityColor(act.sport_type)
  const chipLabel = km >= 1 ? String(Math.round(km)) : '●'

  return (
    <Link
      href={`/activities/${act.id}`}
      className="flex w-full min-w-0 justify-center"
      aria-label={act.title ?? `${chipLabel} km`}
      onMouseEnter={(e) => onHoverActivity?.(act, { x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHoverActivity?.(null)}
    >
      <span
        className={`${color} w-full rounded-md px-0.5 py-1 text-center text-[10px] font-semibold leading-none tabular-nums text-white ${
          compact ? '' : 'md:hidden'
        }`}
      >
        {chipLabel}
      </span>
      {!compact && (
        <span
          className={`hidden ${color} ${getBubbleSize(km, 'full')} flex-col items-center justify-center rounded-full font-semibold leading-tight text-white transition-all hover:ring-2 hover:ring-orange-400 hover:ring-offset-2 md:flex`}
        >
          {km >= 1 ? (
            <>
              <span className="tabular-nums">{formatKmBubble(act.distance_meters)}</span>
              <span className="text-[8px] font-medium opacity-90">km</span>
            </>
          ) : (
            '●'
          )}
        </span>
      )}
    </Link>
  )
}
