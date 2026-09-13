'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { RecoveryChart } from './RecoveryChart'
import { MorningCheckIn } from '@/components/recovery/MorningCheckIn'
import type { RecoveryDayPoint } from '@/lib/training/recovery-series'

function formatHours(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} h`
}

export function RecoverySection({
  today,
  series,
  todayPoint,
  loggedToday,
}: {
  today: string
  series: RecoveryDayPoint[]
  todayPoint: RecoveryDayPoint
  loggedToday: boolean
}) {
  const [editing, setEditing] = useState(!loggedToday)
  const hasAnySleep = series.some((row) => row.sleepHours != null)

  useEffect(() => {
    if (loggedToday) setEditing(false)
  }, [loggedToday])

  return (
    <section className="rounded-xl border border-surface bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-accent-400 to-accent-600" />
          Cómo amaneciste
        </h2>
        <Link
          href="/recovery"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400"
        >
          Historial
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loggedToday && !editing ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-bold tabular-nums tracking-tight">{formatHours(todayPoint.sleepHours)}</p>
            <p className="text-sm text-muted">
              anoche{todayPoint.sleepScore != null ? ` · calidad ${todayPoint.sleepScore}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-accent-600 dark:text-accent-400"
          >
            Corregir
          </button>
        </div>
      ) : (
        <div className="mb-3">
          {!loggedToday ? (
            <p className="mb-3 text-sm text-muted">Todavía no cargaste el sueño de hoy.</p>
          ) : null}
          <MorningCheckIn
            today={today}
            compact
            initial={{
              sleepHours: todayPoint.sleepHours,
              sleepScore: todayPoint.sleepScore,
              restingHr: todayPoint.restingHr,
              hrv: todayPoint.hrv,
              soreness: todayPoint.soreness,
              motivation: todayPoint.motivation,
            }}
          />
        </div>
      )}

      {hasAnySleep ? <RecoveryChart series={series} height={140} compact /> : null}
    </section>
  )
}
