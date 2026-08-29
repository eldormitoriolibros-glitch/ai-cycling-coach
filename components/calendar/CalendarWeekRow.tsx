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
  CALENDAR_GRID_COLS,
  CALENDAR_GRID_COLS_COMPACT,
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
  const gridCols = compact ? CALENDAR_GRID_COLS_COMPACT : CALENDAR_GRID_COLS
  const barWidth =
    maxWeekDistance > 0 && week.totalDistance > 0
      ? Math.max(28, Math.round((week.totalDistance / maxWeekDistance) * 100))
      : 100

  return (
    <div className={`grid ${gridCols} gap-0 items-center ${compact ? 'py-2' : 'py-4'}`}>
      {showWeekLabel ? (
        <div className={`${compact ? 'pr-2' : 'pr-4'} text-right space-y-0.5`}>
          <p className={`font-medium text-muted ${compact ? 'text-[10px]' : 'text-xs'}`}>{week.label}</p>
          {week.totalDistance > 0 && (
            <>
              <p className={`font-bold text-orange-500 tabular-nums ${compact ? 'text-xs' : 'text-base'}`}>
                {formatCalendarDistance(week.totalDistance)}
              </p>
              {week.totalSeconds > 0 && (
                <p className={`text-muted tabular-nums ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                  {formatCalendarDuration(week.totalSeconds)}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div />
      )}

      {Array.from({ length: 7 }, (_, dayIdx) => {
        const dayDate = new Date(week.startDate)
        dayDate.setDate(dayDate.getDate() + dayIdx)
        const dayActs = week.activities.get(dayIdx) ?? []
        const isToday = isSameDay(dayDate, today)

        return (
          <div
            key={dayIdx}
            className={`flex flex-col items-center gap-1 justify-center relative ${
              compact ? 'min-h-[44px]' : 'min-h-[72px]'
            }`}
          >
            {showDayNumbers && (
              <span className={`text-muted ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{dayDate.getDate()}</span>
            )}
            {isToday && (
              <span className={`font-bold text-orange-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>Hoy</span>
            )}
            {dayActs.length === 0 && !isToday && (
              <span className="text-muted text-[10px]">·</span>
            )}
            {dayActs.map((act) => {
              const km = (act.distance_meters ?? 0) / 1000
              return (
                <Link key={act.id} href={`/activities/${act.id}`}>
                  <div
                    className={`${getActivityColor(act.sport_type)} ${getBubbleSize(km, compact ? 'compact' : 'full')} rounded-full flex flex-col items-center justify-center text-white font-semibold cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-orange-400 transition-all leading-tight`}
                    onMouseEnter={(e) =>
                      onHoverActivity?.(act, { x: e.clientX, y: e.clientY })
                    }
                    onMouseLeave={() => onHoverActivity?.(null)}
                  >
                    {km >= 1 && !compact ? (
                      <>
                        <span className="tabular-nums">{formatKmBubble(act.distance_meters)}</span>
                        <span className="text-[8px] font-medium opacity-90">km</span>
                      </>
                    ) : null}
                    {compact && km >= 1 ? '●' : ''}
                  </div>
                </Link>
              )
            })}
            {!compact && dayActs.length > 0 && (
              <span className="text-[9px] text-muted truncate max-w-[88px] text-center">
                {dayActs[0].title ?? dayActs[0].sport_type ?? ''}
              </span>
            )}
          </div>
        )
      })}

      {showSummaryBar ? (
        <div className="pl-2 flex justify-start">
          {week.totalDistance > 0 && (
            <div
              className={`rounded-md bg-orange-100 dark:bg-orange-950/40 flex flex-col justify-center px-2.5 py-1.5 min-w-[72px] ${compact ? 'min-h-[36px]' : 'min-h-[44px]'}`}
              style={{ width: `${barWidth}%`, maxWidth: '100%' }}
            >
              <span className={`font-bold text-orange-600 dark:text-orange-400 tabular-nums whitespace-nowrap ${compact ? 'text-[10px]' : 'text-xs'}`}>
                {formatCalendarDistance(week.totalDistance)}
              </span>
              {week.totalSeconds > 0 && (
                <span className={`text-orange-700/80 dark:text-orange-300/80 tabular-nums whitespace-nowrap ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
                  {formatCalendarDurationLong(week.totalSeconds)}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div />
      )}
    </div>
  )
}
