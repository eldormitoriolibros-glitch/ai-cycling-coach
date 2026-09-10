'use client'

import { useState } from 'react'
import { Card } from '@/components/ui'
import { classifyLaps, type ActivityLapRow } from '@/lib/activities/laps'

type Metric = 'power' | 'hr' | 'speed'

const METRIC_LABEL: Record<Metric, string> = {
  power: 'Potencia',
  hr: 'Pulso',
  speed: 'Velocidad',
}

function metricValue(lap: ActivityLapRow, metric: Metric): number | null {
  if (metric === 'power') return lap.avg_power
  if (metric === 'hr') return lap.avg_hr
  return lap.avg_speed == null ? null : lap.avg_speed * 3.6
}

function metricUnit(metric: Metric): string {
  return metric === 'power' ? 'W' : metric === 'hr' ? 'ppm' : 'km/h'
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The blocks the athlete cut with the lap button: a bar per block sized by the
 * chosen metric and widened by its duration, plus the full table. Hovering
 * either one highlights the same block on the other.
 */
export function ActivityLaps({ laps }: { laps: ActivityLapRow[] }) {
  const hasPower = laps.some((l) => l.avg_power != null)
  const [metric, setMetric] = useState<Metric>(hasPower ? 'power' : 'hr')
  const [hovered, setHovered] = useState<number | null>(null)

  if (laps.length < 2) return null

  const classified = classifyLaps(laps)
  const values = classified.map((l) => metricValue(l, metric) ?? 0)
  const max = Math.max(...values, 1)
  const totalTime = classified.reduce((sum, l) => sum + (l.moving_seconds ?? l.elapsed_seconds ?? 0), 0) || 1

  const available: Metric[] = [
    ...(hasPower ? (['power'] as Metric[]) : []),
    ...(laps.some((l) => l.avg_hr != null) ? (['hr'] as Metric[]) : []),
    ...(laps.some((l) => l.avg_speed != null) ? (['speed'] as Metric[]) : []),
  ]

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Bloques ({classified.length})</h2>
          <p className="text-xs text-muted">
            Cada bloque es una vuelta marcada con el botón lap. El ancho de la barra es su duración.
          </p>
        </div>
        {available.length > 1 && (
          <div className="inline-flex rounded-lg border border-surface p-1">
            {available.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  metric === m ? 'bg-accent-500 text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                {METRIC_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-40 items-end gap-[2px]" onMouseLeave={() => setHovered(null)}>
        {classified.map((lap) => {
          const value = metricValue(lap, metric)
          const height = value == null ? 4 : Math.max(4, Math.round((value / max) * 100))
          const seconds = lap.moving_seconds ?? lap.elapsed_seconds ?? 0
          const active = hovered === lap.lap_index
          return (
            <div
              key={lap.lap_index}
              className="relative flex h-full cursor-default flex-col justify-end"
              style={{ flexGrow: Math.max(seconds / totalTime, 0.02), flexBasis: 0 }}
              onMouseEnter={() => setHovered(lap.lap_index)}
              title={`Bloque ${lap.lap_index} · ${fmtDuration(seconds)} · ${
                value == null ? '—' : Math.round(value)
              } ${metricUnit(metric)}`}
            >
              {active && (
                <span className="absolute inset-x-0 bottom-0 top-0 rounded-sm bg-foreground/5" aria-hidden />
              )}
              <div
                className={`relative w-full rounded-t-sm transition ${
                  lap.effort === 'work'
                    ? active
                      ? 'bg-red-400'
                      : 'bg-red-500/85'
                    : active
                      ? 'bg-slate-400/80'
                      : 'bg-slate-500/50'
                } ${active ? 'ring-2 ring-inset ring-white/70' : ''}`}
                style={{ height: `${height}%` }}
              />
            </div>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-surface text-muted">
              <th className="py-1.5 pr-3 font-medium">#</th>
              <th className="py-1.5 pr-3 font-medium">Tiempo</th>
              <th className="py-1.5 pr-3 font-medium">Distancia</th>
              <th className="py-1.5 pr-3 font-medium">Vel. media</th>
              <th className="py-1.5 pr-3 font-medium">Pulso</th>
              <th className="py-1.5 pr-3 font-medium">Cadencia</th>
              <th className="py-1.5 pr-3 font-medium">Potencia</th>
              <th className="py-1.5 font-medium">Desnivel</th>
            </tr>
          </thead>
          <tbody onMouseLeave={() => setHovered(null)}>
            {classified.map((lap) => (
              <tr
                key={lap.lap_index}
                onMouseEnter={() => setHovered(lap.lap_index)}
                className={`border-b border-surface/60 transition-colors ${
                  hovered === lap.lap_index ? 'bg-accent-500/10' : ''
                }`}
              >
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${lap.effort === 'work' ? 'bg-red-500' : 'bg-slate-500/60'}`}
                    />
                    {lap.lap_index}
                  </span>
                </td>
                <td className="py-1.5 pr-3 font-semibold tabular-nums">
                  {fmtDuration(lap.moving_seconds ?? lap.elapsed_seconds)}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {lap.distance_meters ? `${(lap.distance_meters / 1000).toFixed(2)} km` : '—'}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {lap.avg_speed ? `${(lap.avg_speed * 3.6).toFixed(1)} km/h` : '—'}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {lap.avg_hr ? `${lap.avg_hr} ppm` : '—'}
                  {lap.max_hr ? <span className="text-muted"> · máx {lap.max_hr}</span> : null}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">{lap.avg_cadence ? `${lap.avg_cadence} rpm` : '—'}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {lap.avg_power ? `${Math.round(lap.avg_power)} W` : '—'}
                  {lap.max_power ? <span className="text-muted"> · máx {Math.round(lap.max_power)}</span> : null}
                </td>
                <td className="py-1.5 tabular-nums">
                  {lap.elevation_gain_meters ? `+${Math.round(lap.elevation_gain_meters)} m` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
