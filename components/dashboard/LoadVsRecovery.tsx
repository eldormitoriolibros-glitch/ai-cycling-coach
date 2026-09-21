'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  SIGNAL_LABEL,
  SIGNAL_UNIT,
  VERDICT_COPY,
  buildAbsorption,
  type Absorption,
  type LoadDay,
} from '@/lib/training/absorption'
import type { RecoveryDayPoint } from '@/lib/training/recovery-series'
import { cn } from '@/lib/utils'

const LOAD_COLOR = 'rgb(var(--accent-500))'
const RECOVERY_COLOR = '#38bdf8'
const STRAINED = '#ef4444'

const RANGE_OPTIONS = [
  { days: 28, label: '4 sem' },
  { days: 90, label: '3 meses' },
  { days: 180, label: '6 meses' },
  { days: 365, label: '1 año' },
] as const

function formatTick(date: string, windowDays: number): string {
  const d = new Date(`${date}T12:00:00`)
  if (windowDays >= 180) return d.toLocaleDateString('es-AR', { month: 'short' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function formatRaw(value: number | null, signal: Absorption['signal']): string {
  if (value == null) return '—'
  const unit = SIGNAL_UNIT[signal]
  const shown = signal === 'sleepHours' ? value.toFixed(1) : String(Math.round(value))
  return unit ? `${shown} ${unit}` : shown
}

const VERDICT_TONE = {
  absorbing: 'text-emerald-600 dark:text-emerald-400',
  stretched: 'text-amber-600 dark:text-amber-400',
  fading: 'text-red-600 dark:text-red-400',
} as const

export function LoadVsRecovery({
  absorption,
  series,
  loads,
  ftp = null,
  compact = false,
  defaultDays = 90,
}: {
  absorption?: Absorption | null
  series?: RecoveryDayPoint[]
  loads?: LoadDay[]
  ftp?: number | null
  compact?: boolean
  defaultDays?: number
}) {
  const [days, setDays] = useState(defaultDays)
  const computed = useMemo(() => {
    if (!series || !loads) return absorption ?? null
    return buildAbsorption({
      series: series.slice(-days),
      loads,
      ftp,
    })
  }, [series, loads, ftp, days, absorption])

  if (!computed) return null

  const copy = VERDICT_COPY[computed.verdict]
  const windowDays = series ? days : computed.days.length
  const data = computed.days.map((day) => ({
    ...day,
    label: formatTick(day.date, windowDays),
    recoveryPlot: day.raw,
  }))
  const tickEvery =
    data.length > 80 ? 14 : data.length > 40 ? 6 : data.length > 16 ? 3 : data.length > 10 ? 2 : 0
  const height = compact ? 160 : windowDays >= 180 ? 280 : 240
  const allowRange = Boolean(series && loads && !compact)

  return (
    <div className="space-y-3">
      <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
        {!compact ? (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                Carga vs recuperación
              </h2>
              <p className="text-xs text-muted">
                Barras = carga del día. Línea = {SIGNAL_LABEL[computed.signal]} de la mañana
                siguiente, encima de esa misma salida. Un día duro está bien; uno que te deja
                flojo al día siguiente, encadenado, no.
              </p>
            </div>
            {allowRange ? (
              <div className="inline-flex shrink-0 gap-1 rounded-lg border border-surface p-1">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => setDays(option.days)}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-medium transition',
                      days === option.days
                        ? 'bg-accent-500 text-white'
                        : 'text-muted hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <p className={cn('text-sm font-semibold', VERDICT_TONE[computed.verdict])}>{copy.label}</p>
        {!compact ? <p className="text-xs text-muted">{copy.note}</p> : null}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} barSize={compact ? 7 : windowDays >= 180 ? 4 : 8}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: compact ? 8 : 10 }}
            interval={tickEvery}
            minTickGap={windowDays >= 90 ? 28 : 8}
          />
          <YAxis
            yAxisId="load"
            tick={{ fontSize: compact ? 8 : 10 }}
            width={compact ? 26 : 34}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="recovery"
            orientation="right"
            tick={{ fontSize: compact ? 8 : 10 }}
            width={compact ? 26 : 34}
            hide={compact}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium">{row.label}</p>
                  <p>Carga: {Math.round(row.load)}</p>
                  {row.intensityFactor != null ? <p>IF: {row.intensityFactor.toFixed(2)}</p> : null}
                  <p>
                    {SIGNAL_LABEL[computed.signal]} mañana siguiente:{' '}
                    {formatRaw(row.raw, computed.signal)}
                  </p>
                  {row.strained ? (
                    <p className="mt-1 text-red-500">No se absorbió: mañana floja</p>
                  ) : row.hard ? (
                    <p className="mt-1 text-muted">Día duro, mañana en rango</p>
                  ) : null}
                </div>
              )
            }}
          />
          <Bar
            yAxisId="load"
            dataKey="load"
            name="Carga"
            maxBarSize={compact ? 10 : windowDays >= 180 ? 8 : 14}
            radius={[3, 3, 0, 0]}
          >
            {data.map((day) => (
              <Cell
                key={day.date}
                fill={day.strained ? STRAINED : LOAD_COLOR}
                fillOpacity={day.strained ? 0.9 : day.hard ? 0.85 : 0.4}
              />
            ))}
          </Bar>
          <Line
            yAxisId="recovery"
            type="monotone"
            dataKey="recoveryPlot"
            name={SIGNAL_LABEL[computed.signal]}
            stroke={RECOVERY_COLOR}
            strokeWidth={compact ? 1.5 : 2}
            dot={compact || windowDays >= 180 ? false : { r: 2.5, fill: RECOVERY_COLOR }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {!compact ? (
        <p className="text-[11px] text-muted">
          Señal: {SIGNAL_LABEL[computed.signal]}
          {computed.usedFtp ? ' · días duros por IF ≥ 0.80 o carga ≥ 100 (FTP)' : ''}
          {' · '}
          {computed.hardCount} días duros · {computed.strainedCount} no absorbidos en 7 días. Rojo =
          esa salida no se absorbió a la mañana siguiente.
        </p>
      ) : null}
    </div>
  )
}
