'use client'

import { useMemo, useState } from 'react'
import type { CalendarActivity } from '@/lib/calendar/types'
import { getMonthsInRange } from '@/lib/calendar/month-grid'
import { CalendarMonthMini } from './CalendarMonthMini'
import { ActivityTooltip } from './ActivityTooltip'

type CalendarMultiMonthViewProps = {
  rangeStart: Date
  rangeEnd: Date
  activities: CalendarActivity[]
  columns?: 2 | 3 | 4
}

export function CalendarMultiMonthView({
  rangeStart,
  rangeEnd,
  activities,
  columns = 3,
}: CalendarMultiMonthViewProps) {
  const [hoveredActivity, setHoveredActivity] = useState<CalendarActivity | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  const months = useMemo(() => getMonthsInRange(rangeStart, rangeEnd), [rangeStart, rangeEnd])

  const colClass =
    columns === 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : columns === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-2 lg:grid-cols-3'

  return (
    <>
      <div className={`grid grid-cols-1 gap-x-6 gap-y-10 ${colClass}`}>
        {months.map(({ year, month }) => {
          const monthStart = new Date(year, month, 1)
          const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)
          const monthActs = activities.filter((act) => {
            const d = new Date(act.start_time)
            return d >= monthStart && d <= monthEnd
          })

          return (
            <CalendarMonthMini
              key={`${year}-${month}`}
              year={year}
              month={month}
              activities={monthActs}
              onHoverActivity={(act, pos) => {
                setHoveredActivity(act)
                if (pos) setHoverPos(pos)
              }}
            />
          )
        })}
      </div>

      {hoveredActivity && <ActivityTooltip activity={hoveredActivity} position={hoverPos} />}
    </>
  )
}
