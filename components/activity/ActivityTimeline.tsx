'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui'

export type TimelinePoint = {
  seconds: number
  hr: number | null
  power: number | null
  cadence: number | null
  speed: number | null
  elevation: number | null
  temperature: number | null
  respirationRate: number | null
}

export type MetricKey = Exclude<keyof TimelinePoint, 'seconds'>

type Metric = {
  key: MetricKey
  label: string
  unit: string
  color: string
  decimals: number
  /** Watts and cadence read wrong if the axis floats above zero. */
  minAtZero?: boolean
  /** Drawn as a filled band behind the lines: it is terrain, not effort. */
  asArea?: boolean
}

const METRICS: Metric[] = [
  { key: 'power', label: 'Potencia', unit: 'W', color: '#06b6d4', decimals: 0, minAtZero: true },
  { key: 'hr', label: 'Pulso', unit: 'ppm', color: '#ef4444', decimals: 0 },
  { key: 'cadence', label: 'Cadencia', unit: 'rpm', color: '#f97316', decimals: 0, minAtZero: true },
  { key: 'speed', label: 'Velocidad', unit: 'km/h', color: '#8b5cf6', decimals: 1, minAtZero: true },
  { key: 'elevation', label: 'Elevación', unit: 'm', color: '#64748b', decimals: 0, asArea: true },
  { key: 'temperature', label: 'Temperatura', unit: '°C', color: '#eab308', decimals: 1 },
  { key: 'respirationRate', label: 'Respiración', unit: 'rpm', color: '#14b8a6', decimals: 1 },
]

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}min`
}

function domainFor(points: TimelinePoint[], metric: Metric): [number, number] {
  const values = points
    .map((p) => p[metric.key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!values.length) return [0, 1]

  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.1, metric.decimals ? 0.5 : 1)
  return [metric.minAtZero ? 0 : Math.floor(min - padding), Math.ceil(max + padding)]
}

function TimelineTooltip({
  active,
  payload,
  label,
  selected,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | string }>
  label?: number | string
  selected: Metric[]
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-muted">{formatClock(Number(label))}</p>
      {selected.map((metric) => {
        const entry = payload.find((p) => p.dataKey === metric.key)
        if (typeof entry?.value !== 'number') return null
        return (
          <p key={metric.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
            <span className="text-muted">{metric.label}</span>
            <span className="font-medium text-foreground">
              {entry.value.toFixed(metric.decimals)} {metric.unit}
            </span>
          </p>
        )
      })}
    </div>
  )
}

/**
 * One chart for the whole ride: the athlete picks which streams to overlay
 * instead of opening a collapsed section per metric. Each series keeps its own
 * scale, so pulse and watts can share the plot without flattening each other.
 */
export function ActivityTimeline({ points }: { points: TimelinePoint[] }) {
  const available = useMemo(
    () =>
      METRICS.filter((metric) =>
        points.some((p) => typeof p[metric.key] === 'number' && Number.isFinite(p[metric.key] as number))
      ),
    [points]
  )

  const [selected, setSelected] = useState<MetricKey[]>(() =>
    available.slice(0, 2).map((metric) => metric.key)
  )

  if (available.length === 0) return null

  const active = available.filter((metric) => selected.includes(metric.key))
  // Two axes is the most a phone can read; the rest keep their scale silently.
  const axisFor = new Map(active.slice(0, 2).map((metric, index) => [metric.key, index === 0 ? 'left' : 'right']))

  const toggle = (key: MetricKey) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">La salida, segundo a segundo</h2>
        <p className="text-xs text-muted">Elegí qué medir en simultáneo. Arrastrá la barra de abajo para hacer zoom.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map((metric) => {
          const on = selected.includes(metric.key)
          return (
            <button
              key={metric.key}
              type="button"
              onClick={() => toggle(metric.key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                on
                  ? 'border-transparent text-white'
                  : 'border-surface text-muted hover:text-foreground'
              }`}
              style={on ? { backgroundColor: metric.color } : undefined}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : metric.color }}
              />
              {metric.label}
            </button>
          )
        })}
      </div>

      {active.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Elegí al menos una medición.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={points} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
            <XAxis
              dataKey="seconds"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatClock}
              tick={{ fontSize: 11 }}
            />
            {active.map((metric) => {
              const orientation = axisFor.get(metric.key)
              return (
                <YAxis
                  key={metric.key}
                  yAxisId={metric.key}
                  domain={domainFor(points, metric)}
                  hide={!orientation}
                  orientation={orientation === 'right' ? 'right' : 'left'}
                  width={44}
                  tick={{ fontSize: 11, fill: metric.color }}
                  tickFormatter={(value: number) => value.toFixed(0)}
                />
              )
            })}
            <Tooltip content={<TimelineTooltip selected={active} />} />
            {active.map((metric) =>
              metric.asArea ? (
                <Area
                  key={metric.key}
                  yAxisId={metric.key}
                  type="monotone"
                  dataKey={metric.key}
                  stroke={metric.color}
                  fill={metric.color}
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={metric.key}
                  yAxisId={metric.key}
                  type="monotone"
                  dataKey={metric.key}
                  stroke={metric.color}
                  strokeWidth={1.6}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )
            )}
            <Brush
              dataKey="seconds"
              height={22}
              travellerWidth={8}
              tickFormatter={formatClock}
              stroke="#94a3b8"
              fill="transparent"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
