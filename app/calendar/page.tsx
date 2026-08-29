'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { CalendarMultiMonthView } from '@/components/calendar/CalendarMultiMonthView'
import type { CalendarActivity, CalendarViewMode } from '@/lib/calendar/types'
import {
  buildWeeksForMonth,
  formatCalendarTitle,
  getMonthRange,
  getSixMonthRange,
  getYearRange,
} from '@/lib/calendar/weeks'

const VIEW_MODES: { id: CalendarViewMode; label: string }[] = [
  { id: 'month', label: 'Mes' },
  { id: '6months', label: '6 meses' },
  { id: 'year', label: 'Año' },
]

function toDateParam(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function CalendarPage() {
  const now = new Date()
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [activities, setActivities] = useState<CalendarActivity[]>([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    if (viewMode === 'month') return getMonthRange(year, month)
    if (viewMode === '6months') return getSixMonthRange(year, month)
    return getYearRange(year)
  }, [viewMode, year, month])

  useEffect(() => {
    setLoading(true)
    const from = toDateParam(range.start)
    const to = toDateParam(range.end)
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [range.start.getTime(), range.end.getTime()])

  const weeks = useMemo(() => {
    if (viewMode !== 'month') return []
    return buildWeeksForMonth(activities, year, month)
  }, [activities, viewMode, year, month])

  const title = formatCalendarTitle(viewMode, year, month)

  const navigatePrev = () => {
    if (viewMode === 'year') {
      setYear((y) => y - 1)
      return
    }
    if (viewMode === '6months') {
      setMonth((m) => {
        const prev = m - 6
        if (prev < 0) {
          setYear((y) => y - 1)
          return prev + 12
        }
        return prev
      })
      return
    }
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const navigateNext = () => {
    if (viewMode === 'year') {
      setYear((y) => y + 1)
      return
    }
    if (viewMode === '6months') {
      setMonth((m) => {
        const next = m + 6
        if (next > 11) {
          setYear((y) => y + 1)
          return next - 12
        }
        return next
      })
      return
    }
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const goToday = () => {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold capitalize">{title}</h1>
          <p className="text-sm text-muted">Calendario de actividades</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-surface bg-surface p-1">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === mode.id
                    ? 'bg-orange-500 text-white'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button
            onClick={goToday}
            className="rounded-md border border-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            Hoy
          </button>
          <div className="flex items-center gap-1">
            <button onClick={navigatePrev} className="rounded p-1 hover:bg-surface" aria-label="Anterior">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={navigateNext} className="rounded p-1 hover:bg-surface" aria-label="Siguiente">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <Card>
          <p className="text-sm text-muted animate-pulse">Cargando actividades...</p>
        </Card>
      ) : viewMode === 'month' ? (
        <CalendarGrid weeks={weeks} />
      ) : (
        <CalendarMultiMonthView
          rangeStart={range.start}
          rangeEnd={range.end}
          activities={activities}
          columns={viewMode === 'year' ? 3 : 3}
        />
      )}
    </div>
  )
}
