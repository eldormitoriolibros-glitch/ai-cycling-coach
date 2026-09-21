'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { meanRestorativeShare, type SleepNight } from '@/lib/training/sleep-architecture'

const COLORS = {
  deep: '#4338ca',
  rem: '#8b5cf6',
  light: '#38bdf8',
  awake: '#f59e0b',
}

function formatTick(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function hoursLabel(value: number): string {
  return `${value.toFixed(1)} h`
}

export function SleepArchitecture({ nights }: { nights: SleepNight[] }) {
  if (nights.length < 2) return null

  const data = nights.map((night) => ({
    ...night,
    label: formatTick(night.date),
    restorativePct: night.restorativeShare == null ? null : Math.round(night.restorativeShare * 100),
  }))
  const share = meanRestorativeShare(nights, 7)
  const tickEvery = data.length > 16 ? 2 : 0

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Arquitectura del sueño</h2>
        <p className="text-xs text-muted">
          Cómo se partió la noche: profundo, REM, ligero y despierto. La línea es la parte
          restauradora (profundo + REM). Ocho horas de ligero no es lo mismo que siete con un bloque
          profundo.
        </p>
        {share != null ? (
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {Math.round(share * 100)}% restaurador
            <span className="ml-1 text-xs font-normal text-muted">promedio, últimos 7 días</span>
          </p>
        ) : null}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} barSize={12}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickEvery} />
          <YAxis
            yAxisId="hours"
            tick={{ fontSize: 10 }}
            width={32}
            unit="h"
            domain={[0, 'auto']}
          />
          <YAxis
            yAxisId="share"
            orientation="right"
            tick={{ fontSize: 10 }}
            width={28}
            domain={[0, 100]}
            unit="%"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium">{row.label}</p>
                  <p>Profundo: {hoursLabel(row.deepHours)}</p>
                  <p>REM: {hoursLabel(row.remHours)}</p>
                  <p>Ligero: {hoursLabel(row.lightHours)}</p>
                  <p>Despierto: {hoursLabel(row.awakeHours)}</p>
                  {row.restorativePct != null ? <p>Restaurador: {row.restorativePct}%</p> : null}
                </div>
              )
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => {
              const labels: Record<string, string> = {
                deepHours: 'Profundo',
                remHours: 'REM',
                lightHours: 'Ligero',
                awakeHours: 'Despierto',
                restorativePct: 'Restaurador',
              }
              return labels[value] ?? value
            }}
          />
          <Bar yAxisId="hours" dataKey="deepHours" stackId="sleep" fill={COLORS.deep} />
          <Bar yAxisId="hours" dataKey="remHours" stackId="sleep" fill={COLORS.rem} />
          <Bar yAxisId="hours" dataKey="lightHours" stackId="sleep" fill={COLORS.light} />
          <Bar
            yAxisId="hours"
            dataKey="awakeHours"
            stackId="sleep"
            fill={COLORS.awake}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="share"
            type="monotone"
            dataKey="restorativePct"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 2.5, fill: '#10b981' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
