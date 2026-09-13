'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RecoveryDayPoint } from '@/lib/training/recovery-series'

function formatTick(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function formatHours(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} h`
}

export function RecoveryChart({
  series,
  height = 160,
  compact = false,
}: {
  series: RecoveryDayPoint[]
  height?: number
  compact?: boolean
}) {
  const data = series.map((row) => ({
    ...row,
    label: formatTick(row.date),
  }))
  const tickEvery = data.length > 10 ? 2 : 0
  const hasScores = data.some((row) => row.sleepScore != null)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} barSize={compact ? 8 : 12}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: compact ? 9 : 10 }} interval={tickEvery} />
        <YAxis
          yAxisId="hours"
          domain={[0, 10]}
          ticks={[0, 4, 7, 10]}
          tick={{ fontSize: compact ? 8 : 10 }}
          width={compact ? 26 : 32}
          unit="h"
        />
        {hasScores ? (
          <YAxis
            yAxisId="score"
            orientation="right"
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tick={{ fontSize: compact ? 8 : 10 }}
            width={compact ? 24 : 28}
          />
        ) : null}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as RecoveryDayPoint & { label: string }
            return (
              <div className="rounded border border-surface bg-white p-2 text-xs shadow-lg dark:bg-slate-800">
                <p className="font-semibold">{row.label}</p>
                <p>Sueño: {formatHours(row.sleepHours)}</p>
                {row.sleepScore != null ? <p>Calidad: {row.sleepScore}</p> : null}
                {row.restingHr != null ? <p>FC reposo: {row.restingHr}</p> : null}
                {row.hrv != null ? <p>HRV: {Math.round(row.hrv)}</p> : null}
              </div>
            )
          }}
        />
        <ReferenceLine yAxisId="hours" y={7} stroke="#94a3b8" strokeDasharray="4 2" strokeOpacity={0.6} />
        <Bar
          yAxisId="hours"
          dataKey="sleepHours"
          name="Sueño"
          fill="#38bdf8"
          radius={[3, 3, 0, 0]}
          maxBarSize={compact ? 10 : 16}
        />
        {hasScores ? (
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="sleepScore"
            name="Calidad"
            stroke="#10b981"
            strokeWidth={compact ? 1.5 : 2}
            dot={compact ? false : { r: 2.5, fill: '#10b981' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
