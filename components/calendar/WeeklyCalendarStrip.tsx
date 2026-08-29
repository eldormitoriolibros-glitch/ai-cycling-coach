'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui'
import type { CalendarActivity } from '@/lib/calendar/types'
import { buildWeeksInRange, DAY_LABELS, getMonday, getSunday } from '@/lib/calendar/weeks'
import { formatCalendarDistance, formatCalendarDuration } from '@/lib/calendar/format'
import { CALENDAR_GRID_COLS_COMPACT } from './calendar-utils'
import { CalendarWeekRow } from './CalendarWeekRow'
import { ActivityTooltip } from './ActivityTooltip'

export function WeeklyCalendarStrip() {
  const [activities, setActivities] = useState<CalendarActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredActivity, setHoveredActivity] = useState<CalendarActivity | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  const now = new Date()
  const { from, to, weekStart, weekEnd } = useMemo(() => {
    const weekStart = getMonday(now)
    const weekEnd = getSunday(now)
    return {
      weekStart,
      weekEnd,
      from: weekStart.toISOString().slice(0, 10),
      to: weekEnd.toISOString().slice(0, 10),
    }
  }, [now.toDateString()])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [from, to])

  const weeks = buildWeeksInRange(activities, weekStart, weekEnd)
  const week = weeks[0]

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Esta semana</h2>
          {week && (
            <>
              <p className="text-xs text-muted mt-0.5 capitalize">{week.label}</p>
              {week.totalDistance > 0 && (
                <p className="text-xs mt-1 tabular-nums">
                  <span className="font-bold text-orange-500">{formatCalendarDistance(week.totalDistance)}</span>
                  {week.totalSeconds > 0 && (
                    <span className="text-muted"> · {formatCalendarDuration(week.totalSeconds)}</span>
                  )}
                </p>
              )}
            </>
          )}
        </div>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-500"
        >
          Ver calendario
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted animate-pulse">Cargando…</p>
      ) : week ? (
        <>
          <div className={`grid ${CALENDAR_GRID_COLS_COMPACT} gap-0 pb-1`}>
            <div />
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[9px] font-semibold text-muted uppercase">
                {d}
              </div>
            ))}
            <div />
          </div>
          <CalendarWeekRow
            week={week}
            compact
            showWeekLabel={false}
            showSummaryBar={false}
            today={now}
            onHoverActivity={(act, pos) => {
              setHoveredActivity(act)
              if (pos) setHoverPos(pos)
            }}
          />
        </>
      ) : (
        <p className="text-sm text-muted">Sin actividades esta semana.</p>
      )}

      {hoveredActivity && <ActivityTooltip activity={hoveredActivity} position={hoverPos} />}
    </Card>
  )
}
