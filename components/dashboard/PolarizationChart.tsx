'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  VERDICT_COPY,
  type PolarizationVerdict,
  type PolarizationWeek,
} from '@/lib/training/polarization'
import { cn } from '@/lib/utils'

const COLORS = { easy: '#3b82f6', mid: '#22c55e', hard: '#ef4444' }

const VERDICT_TONE: Record<PolarizationVerdict, string> = {
  polarized: 'text-emerald-600 dark:text-emerald-400',
  pyramidal: 'text-sky-600 dark:text-sky-400',
  threshold: 'text-amber-600 dark:text-amber-400',
  'too-hard': 'text-red-600 dark:text-red-400',
  'too-easy': 'text-muted',
}

function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  })
}

export function PolarizationChart({
  compact = false,
  days = 112,
}: {
  compact?: boolean
  days?: number
}) {
  const [weeks, setWeeks] = useState<PolarizationWeek[]>([])
  const [verdict, setVerdict] = useState<PolarizationVerdict | null>(null)
  const [usedFtp, setUsedFtp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/training/polarization?days=${days}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (json.error) {
          setError(json.error)
          return
        }
        setWeeks(json.weeks ?? [])
        setVerdict(json.verdict ?? null)
        setUsedFtp(Boolean(json.usedFtp))
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar la polarización')
      })
    return () => {
      cancelled = true
    }
  }, [days])

  if (error) {
    return compact ? null : (
      <p className="text-xs text-muted">
        Polarización 80/20: {error}. Corré la migración y «Analizar polarización» en Conexiones.
      </p>
    )
  }

  if (weeks.length < 2) {
    if (compact) return null
    return (
      <p className="text-xs text-muted">
        Polarización 80/20: analizá el historial en Conexiones. Alcanza con FC máx y los streams;
        el FTP suma vatios el día que esté.
      </p>
    )
  }

  const copy = verdict ? VERDICT_COPY[verdict] : null
  const data = weeks.map((week) => ({
    ...week,
    label: weekLabel(week.weekStart),
    easyPct: Math.round(week.shares.easy * 100),
    midPct: Math.round(week.shares.mid * 100),
    hardPct: Math.round(week.shares.hard * 100),
  }))
  const shown = compact && data.length > 12 ? data.slice(-12) : data

  return (
    <div className={cn('space-y-3', compact && 'rounded-lg border border-surface p-3')}>
      <div>
        <h3 className={compact ? 'text-xs font-semibold uppercase tracking-wide' : 'font-semibold'}>
          Polarización 80/20
        </h3>
        {!compact ? (
          <p className="mt-1 text-xs text-muted">
            Tiempo de la semana en suave (Z1–Z2), tempo (Z3) e intenso (Z4–Z5). Seiler: cerca de
            80% suave, el resto intenso, casi nada en el medio.
            {usedFtp ? ' Semanas con vatios usan potencia; el resto, pulso.' : ' Hoy se mide por pulso. El día que haya FTP, las semanas con potenciómetro pasan a vatios.'}
          </p>
        ) : null}
        {copy ? (
          <p className={cn('mt-1 text-sm font-semibold', VERDICT_TONE[verdict!])}>{copy.label}</p>
        ) : null}
        {copy && !compact ? <p className="text-xs text-muted">{copy.note}</p> : null}
      </div>

      <ResponsiveContainer width="100%" height={compact ? 160 : 220}>
        <ComposedChart data={shown} barSize={compact ? 10 : 16}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: compact ? 8 : 10 }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: compact ? 8 : 10 }}
            width={compact ? 24 : 32}
            unit="%"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium">Semana del {row.label}</p>
                  <p>Suave: {row.easyPct}%</p>
                  <p>Tempo: {row.midPct}%</p>
                  <p>Intenso: {row.hardPct}%</p>
                  <p className="text-muted">{row.metric === 'power' ? 'Por potencia' : 'Por pulso'}</p>
                </div>
              )
            }}
          />
          <ReferenceLine y={80} stroke="#94a3b8" strokeDasharray="4 3" />
          <Bar dataKey="easyPct" stackId="pol" fill={COLORS.easy} name="Suave" />
          <Bar dataKey="midPct" stackId="pol" fill={COLORS.mid} name="Tempo" />
          <Bar dataKey="hardPct" stackId="pol" fill={COLORS.hard} name="Intenso" radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>

      {!compact ? (
        <p className="text-[11px] text-muted">
          Azul = suave · verde = tempo · rojo = intenso. La línea punteada es el 80% suave.
          Veredicto sobre las últimas 4 semanas.
        </p>
      ) : null}
    </div>
  )
}
