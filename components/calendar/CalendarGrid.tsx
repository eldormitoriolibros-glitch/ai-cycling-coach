'use client'

import { useState } from 'react'
import type { CalendarActivity, WeekData } from '@/lib/calendar/types'
import { DAY_LABELS } from '@/lib/calendar/weeks'
import { CALENDAR_GRID_COLS, CALENDAR_GRID_COLS_COMPACT } from './calendar-utils'
import { CalendarWeekRow } from './CalendarWeekRow'
import { ActivityTooltip } from './ActivityTooltip'

type CalendarGridProps = {
  weeks: WeekData[]
  compact?: boolean
  showDayNumbers?: boolean
  monthDividers?: boolean
}

export function CalendarGrid({
  weeks,
  compact = false,
  showDayNumbers = false,
  monthDividers = false,
}: CalendarGridProps) {
  const [hoveredActivity, setHoveredActivity] = useState<CalendarActivity | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const gridCols = compact ? CALENDAR_GRID_COLS_COMPACT : CALENDAR_GRID_COLS
  const today = new Date()
  const maxWeekDistance = weeks.reduce((max, w) => Math.max(max, w.totalDistance), 0)

  let lastMonthKey = ''

  return (
    <>
      <div className="space-y-0 divide-y divide-surface">
        <div className={`grid ${gridCols} gap-0 pb-2`}>
          <div />
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className={`text-center font-semibold text-muted uppercase ${
                compact ? 'text-[9px]' : 'text-xs'
              }`}
            >
              {d}
            </div>
          ))}
          <div />
        </div>

        {weeks.map((week, wi) => {
          const weekMonthKey = `${week.startDate.getFullYear()}-${week.startDate.getMonth()}`
          const showDivider = monthDividers && weekMonthKey !== lastMonthKey
          lastMonthKey = weekMonthKey

          return (
            <div key={wi}>
              {showDivider && (
                <p className={`capitalize text-muted pt-3 pb-1 ${compact ? 'text-xs' : 'text-sm font-medium'}`}>
                  {week.startDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </p>
              )}
              <CalendarWeekRow
                week={week}
                compact={compact}
                showDayNumbers={showDayNumbers || compact}
                maxWeekDistance={maxWeekDistance}
                today={today}
                onHoverActivity={(act, pos) => {
                  setHoveredActivity(act)
                  if (pos) setHoverPos(pos)
                }}
              />
            </div>
          )
        })}
      </div>

      {hoveredActivity && <ActivityTooltip activity={hoveredActivity} position={hoverPos} />}
    </>
  )
}
