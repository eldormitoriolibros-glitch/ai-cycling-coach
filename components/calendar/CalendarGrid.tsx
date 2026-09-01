'use client'

import { useState } from 'react'
import type { CalendarActivity, WeekData } from '@/lib/calendar/types'
import { CalendarWeekRow } from './CalendarWeekRow'
import { WeekdayHeader } from './WeekdayHeader'
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
  showDayNumbers = !compact,
  monthDividers = false,
}: CalendarGridProps) {
  const [hoveredActivity, setHoveredActivity] = useState<CalendarActivity | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const today = new Date()
  const todayInView = weeks.some((w) => today >= w.startDate && today <= w.endDate)
  const maxWeekDistance = weeks.reduce((max, w) => Math.max(max, w.totalDistance), 0)

  let lastMonthKey = ''

  return (
    <>
      <div className="space-y-0 divide-y divide-surface">
        <WeekdayHeader today={todayInView ? today : undefined} compact={compact} withSideColumns={!compact} />

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
                showDayNumbers={showDayNumbers}
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
