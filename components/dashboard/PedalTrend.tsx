'use client'

import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui'
import { balanceNote } from '@/lib/garmin/pedal-metrics'
import type { PedalTrend as PedalTrendData } from '@/lib/training/pedal-trend'

function formatTick(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function PedalTrend() {
  const [trend, setTrend] = useState<PedalTrendData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/training/pedal-trend?days=180')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && !json.error) setTrend(json)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!trend || trend.points.length < 2) return null

  const data = trend.points.map((point) => ({
    ...point,
    label: formatTick(point.date),
  }))
  const tickEvery = data.length > 16 ? 3 : 0
  const hasTe = data.some((p) => p.te != null)
  const lean =
    trend.meanLeft != null ? balanceNote(trend.meanLeft) : null

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Pedaleo, 6 meses</h2>
        <p className="text-xs text-muted">
          Balance izquierda / derecha alrededor de 50/50. La suavidad y la efectividad de torque
          van en el eje derecho cuando el medidor las manda.
        </p>
        {lean && trend.meanLeft != null ? (
          <p className="mt-1 text-sm font-semibold">
            I {trend.meanLeft.toFixed(1)} / D {(100 - trend.meanLeft).toFixed(1)}
            <span className="ml-2 text-xs font-normal text-muted">{lean}</span>
          </p>
        ) : null}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickEvery} />
          <YAxis
            yAxisId="balance"
            domain={[40, 60]}
            ticks={[40, 45, 50, 55, 60]}
            tick={{ fontSize: 10 }}
            width={32}
            unit="%"
          />
          {hasTe ? (
            <YAxis
              yAxisId="quality"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              width={28}
              unit="%"
            />
          ) : null}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium">{row.title || row.label}</p>
                  {row.leftPct != null ? (
                    <p>
                      Balance I {row.leftPct.toFixed(1)} / D {(100 - row.leftPct).toFixed(1)}
                    </p>
                  ) : null}
                  {row.te != null ? <p>Efectividad: {Math.round(row.te)}%</p> : null}
                  {row.smooth != null ? <p>Suavidad: {Math.round(row.smooth)}%</p> : null}
                </div>
              )
            }}
          />
          <ReferenceLine yAxisId="balance" y={50} stroke="#94a3b8" strokeDasharray="4 3" />
          <Line
            yAxisId="balance"
            type="monotone"
            dataKey="leftPct"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ r: 2.5, fill: '#0ea5e9' }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {hasTe ? (
            <Line
              yAxisId="quality"
              type="monotone"
              dataKey="te"
              stroke="#22c55e"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : null}
          {data.some((p) => p.smooth != null) ? (
            <Line
              yAxisId="quality"
              type="monotone"
              dataKey="smooth"
              stroke="#a78bfa"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-muted">
        Celeste = % izquierda (50 es simétrico). Verde = efectividad. Violeta = suavidad.
      </p>
    </Card>
  )
}
