'use client'

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EfficiencyTrend as EfficiencyTrendData } from '@/lib/training/efficiency-factor'
import { Card } from '@/components/ui'

function formatTick(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function EfficiencyTrend({ trend }: { trend: EfficiencyTrendData }) {
  const aerobic = trend.points.filter((p) => p.aerobic)
  if (aerobic.length < 2) return null

  const data = aerobic.map((point) => ({
    ...point,
    label: formatTick(point.date),
  }))
  const tickEvery = data.length > 16 ? 3 : 0
  const delta =
    trend.recentMean != null && trend.previousMean != null
      ? Math.round(((trend.recentMean - trend.previousMean) / trend.previousMean) * 100)
      : null

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Factor de eficiencia
        </h2>
        <p className="text-xs text-muted">
          Vatios por pulsación en salidas con potenciómetro (40 min o más; IF ≤
          0.85 si hay FTP). Subir con el tiempo es el motor volviéndose más
          barato.
        </p>
        {trend.recentMean != null ? (
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {trend.recentMean.toFixed(2)} W/ppm
            {delta != null ? (
              <span className="ml-2 text-xs font-normal text-muted">
                {delta > 0 ? '+' : ''}
                {delta}% vs las 6 anteriores
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickEvery} />
          <YAxis
            tick={{ fontSize: 10 }}
            width={40}
            domain={['auto', 'auto']}
            tickFormatter={(value) => Number(value).toFixed(2)}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium">{row.title || row.label}</p>
                  <p>EF: {row.ef.toFixed(3)} W/ppm</p>
                  <p>
                    {row.power} W / {row.hr} ppm
                  </p>
                  <p>{Math.round(row.seconds / 60)} min</p>
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="ef"
            stroke="rgb(var(--accent-500))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter dataKey="ef" fill="rgb(var(--accent-500))" />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}
