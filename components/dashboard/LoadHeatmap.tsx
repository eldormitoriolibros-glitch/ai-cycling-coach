'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildLoadScale, loadFill, loadLevel } from '@/lib/training/load-scale'
import { LoadScaleLegend } from './LoadScaleLegend'

type LoadRow = { date: string; dailyLoad: number | null }

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const CELL = 13
const GAP = 3

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Monday of the week the given day belongs to. */
function mondayOf(date: Date): Date {
  const day = (date.getDay() + 6) % 7
  return addDays(date, -day)
}

export function LoadHeatmap({ weeks = 52 }: { weeks?: number }) {
  const router = useRouter()
  const [rows, setRows] = useState<LoadRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<{ date: string; load: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/training/load-history?days=${weeks * 7}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setRows(Array.isArray(json?.loadTimeline) ? json.loadTimeline : [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weeks])

  const grid = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const row of rows ?? []) byDate.set(row.date, Math.round(row.dailyLoad ?? 0))

    const start = addDays(mondayOf(new Date()), -(weeks - 1) * 7)
    const columns: Array<Array<{ date: string; load: number; future: boolean }>> = []
    const today = dateKey(new Date())

    for (let w = 0; w < weeks; w++) {
      const column = []
      for (let d = 0; d < 7; d++) {
        const key = dateKey(addDays(start, w * 7 + d))
        column.push({ date: key, load: byDate.get(key) ?? 0, future: key > today })
      }
      columns.push(column)
    }

    const days = columns.flat().filter((day) => !day.future)
    const loads = days.map((day) => day.load)
    const trained = days.filter((day) => day.load > 0)

    let streak = 0
    let bestStreak = 0
    for (const day of days) {
      streak = day.load > 0 ? streak + 1 : 0
      bestStreak = Math.max(bestStreak, streak)
    }

    const weekTotals = columns.map((column) => column.reduce((sum, day) => sum + day.load, 0))

    return {
      columns,
      scale: buildLoadScale(loads),
      total: Math.round(loads.reduce((a, b) => a + b, 0)),
      trainedDays: trained.length,
      bestStreak,
      bestWeek: Math.round(Math.max(0, ...weekTotals)),
    }
  }, [rows, weeks])

  if (loading) return <p className="text-sm text-muted animate-pulse">Cargando el año…</p>
  if (!rows?.length) return <p className="text-sm text-muted">Sin carga registrada todavía.</p>

  const monthLabels = grid.columns.map((column, i) => {
    const first = new Date(`${column[0].date}T12:00:00`)
    const previous = i === 0 ? null : new Date(`${grid.columns[i - 1][0].date}T12:00:00`)
    if (previous && previous.getMonth() === first.getMonth()) return null
    return {
      column: i,
      label: first.toLocaleDateString('es-AR', { month: 'short' }),
    }
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide">Año de entrenamiento</h3>
          <p className="text-[10px] text-muted">
            Últimas 52 semanas. Cada cuadrado es un día, más intenso es más carga, medida contra
            tus propios días duros. Tocá uno para ir a ese día.
          </p>
        </div>
        <p className="text-[11px] tabular-nums text-muted">
          {hovered
            ? `${hovered.date} · carga ${hovered.load}`
            : `${grid.trainedDays} días con carga · racha ${grid.bestStreak} d · pico semanal ${grid.bestWeek}`}
        </p>
      </div>

      <div className="no-scrollbar overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          <div
            className="grid shrink-0 pt-[14px] text-[9px] text-muted"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}
          >
            {WEEKDAYS.map((day, i) => (
              <span key={day} className="leading-none">
                {i % 2 === 0 ? day : ''}
              </span>
            ))}
          </div>

          <div>
            <div
              className="grid text-[9px] text-muted"
              style={{
                gridTemplateColumns: `repeat(${grid.columns.length}, ${CELL}px)`,
                columnGap: GAP,
                height: 14,
              }}
            >
              {monthLabels.map((month) =>
                month ? (
                  <span
                    key={month.column}
                    className="whitespace-nowrap capitalize leading-none"
                    style={{ gridColumnStart: month.column + 1 }}
                  >
                    {month.label}
                  </span>
                ) : null
              )}
            </div>

            <div
              className="grid grid-flow-col"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gap: GAP }}
              onMouseLeave={() => setHovered(null)}
              onClick={(event) => {
                const date = (event.target as HTMLElement).dataset.date
                if (date) router.push(`/calendar?date=${date}`)
              }}
            >
              {grid.columns.flatMap((column) =>
                column.map((day) => {
                  const level = loadLevel(day.load, grid.scale)
                  return (
                    <div
                      key={day.date}
                      data-date={day.future ? undefined : day.date}
                      title={day.future ? undefined : `${day.date} · carga ${day.load}`}
                      onMouseEnter={() =>
                        day.future ? undefined : setHovered({ date: day.date, load: day.load })
                      }
                      className={
                        day.future
                          ? 'rounded-[2px] opacity-0'
                          : 'cursor-pointer rounded-[2px] ring-1 ring-inset ring-black/5 transition hover:ring-accent-400 dark:ring-white/5'
                      }
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: loadFill(level),
                      }}
                    />
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <LoadScaleLegend className="justify-end" />
    </div>
  )
}
