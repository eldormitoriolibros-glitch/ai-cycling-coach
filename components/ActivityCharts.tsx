'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, Alert } from '@/components/ui'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ActivityRow } from '@/lib/types/database'
import { getHrZoneBounds, getPowerZoneBounds, countHrZones, countPowerZones } from '@/lib/training/zones'

const ActivityMap = dynamic(() => import('./ActivityMap'), { ssr: false })

type ActivitySample = {
  offset_seconds: number
  heart_rate: number | null
  power: number | null
  cadence: number | null
  speed: number | null
  elevation: number | null
  temperature: number | null
  latitude: number | null
  longitude: number | null
}

type ChartPoint = {
  seconds: number
  hr: number | null
  power: number | null
  cadence: number | null
  speed: number | null
  elevation: number | null
  temperature: number | null
}

type Props = {
  activity: ActivityRow & { maxHr?: number; ftp?: number }
  samples?: ActivitySample[]
}

/**
 * Process real activity samples into chart data. `maxHr`/`ftp` must be the same
 * profile-level values used to draw the zone boundaries, or the percentages
 * shown won't match the bands (this used to fall back to the ride's own peak
 * HR/a crude power guess, which skewed the distribution toward Z3/Z4).
 */
function processRealSamples(samples: ActivitySample[], maxHr: number | null, ftp: number | null) {
  if (!samples.length) return null

  const hrZones = countHrZones(
    samples.map((s) => s.heart_rate),
    maxHr
  )
  const pwrZones = countPowerZones(
    samples.map((s) => s.power),
    ftp
  )

  return {
    timeSeries: samples.map((s) => ({
      seconds: s.offset_seconds,
      hr: s.heart_rate,
      power: s.power,
      cadence: s.cadence,
      speed: s.speed === null ? null : s.speed * 3.6,
      elevation: s.elevation,
      temperature: s.temperature,
    })),
    hrZones,
    pwrZones,
  }
}

function formatAxisTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
}

/**
 * Averages raw points into buckets so the chart renders a readable trend line
 * instead of thousands of overlapping strokes (same idea Strava/Garmin use when zoomed out).
 * Zone calculations still use the raw samples, this is display-only.
 */
function downsampleSeries(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (points.length <= maxPoints) return points

  const bucketSize = Math.ceil(points.length / maxPoints)
  const numericKeys: Array<Exclude<keyof ChartPoint, 'seconds'>> = [
    'hr',
    'power',
    'cadence',
    'speed',
    'elevation',
    'temperature',
  ]
  const result: ChartPoint[] = []

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize)
    const point = { seconds: bucket[Math.floor(bucket.length / 2)].seconds } as ChartPoint

    for (const key of numericKeys) {
      const values = bucket.map((p) => p[key]).filter((v): v is number => typeof v === 'number')
      point[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    }

    result.push(point)
  }

  return result
}

/**
 * Computes a numeric Y-axis domain directly from the data instead of Recharts'
 * `'dataMax + N'` string expressions, which can render bogus tick labels when
 * the underlying value isn't a clean number.
 */
function numericDomain(
  points: ChartPoint[],
  key: Exclude<keyof ChartPoint, 'seconds'>,
  padding: number,
  minAtZero = false
): [number, number] {
  const values = points.map((p) => p[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!values.length) return [0, padding || 1]

  const min = Math.min(...values)
  const max = Math.max(...values)
  return [minAtZero ? 0 : Math.floor(min - padding), Math.ceil(max + padding)]
}

export function ActivityCharts({ activity, samples }: Props) {
  const [realSamples, setRealSamples] = useState<ActivitySample[] | null>(samples || null)
  const [loadingSamples, setLoadingSamples] = useState(!samples)

  // Load samples from API if not provided
  useEffect(() => {
    if (samples) return // Already have samples

    let cancelled = false
    const loadSamples = async () => {
      try {
        const res = await fetch(`/api/activities/${activity.id}/samples`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setRealSamples(data)
        }
      } catch (err) {
        console.error('Failed to load activity samples:', err)
      } finally {
        if (!cancelled) setLoadingSamples(false)
      }
    }

    loadSamples()
    return () => {
      cancelled = true
    }
  }, [activity.id, samples])

  // Profile-level thresholds — must match what's used to bucket the real samples below,
  // or the zone percentages won't line up with the bands shown.
  const resolvedMaxHr = activity.maxHr || activity.max_hr || null
  const resolvedFtp = activity.ftp ?? null

  const hrZoneBounds = getHrZoneBounds(resolvedMaxHr)
  const powerZoneBounds = getPowerZoneBounds(resolvedFtp)

  const hasStreams = Boolean(realSamples?.length)
  const chartData = hasStreams ? processRealSamples(realSamples!, resolvedMaxHr, resolvedFtp) : null
  const timeSeries = chartData ? downsampleSeries(chartData.timeSeries, 1500) : []

  const mapPoints = (realSamples ?? [])
    .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
    .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }))

  const displayHrZones = (() => {
    if (!hrZoneBounds || !chartData) return null
    const total = Object.values(chartData.hrZones).reduce((a, b) => a + b, 0)
    if (total === 0) return null // no real HR samples on this ride — nothing to show
    return hrZoneBounds.map((zone) => {
      const count = chartData.hrZones[zone.zone as keyof typeof chartData.hrZones]
      return { ...zone, value: Math.round((count / total) * 100) }
    })
  })()

  const displayPowerZones = (() => {
    if (!powerZoneBounds || !chartData) return null
    const total = Object.values(chartData.pwrZones).reduce((a, b) => a + b, 0)
    if (total === 0) return null // no real power samples on this ride — nothing to show
    return powerZoneBounds.map((zone) => {
      const count = chartData.pwrZones[zone.zone as keyof typeof chartData.pwrZones]
      return { ...zone, value: Math.round((count / total) * 100) }
    })
  })()

  const hasElevationData = realSamples?.some((s) => s.elevation !== null) ?? false


  return (
    <div className="space-y-4">
      {/* Zone Info Alert */}
      <Alert variant="info">
        <strong>Zonas de entrenamiento:</strong> Usando estándares Strava/Garmin (bandas de 10% en pulso y potencia).
        Se calculan con tus valores de FC máxima y FTP del perfil.{' '}
        <a href="/profile" className="underline">
          Actualiza tus métricas en el perfil
        </a>{' '}
        para ajustar los rangos.
      </Alert>

      {/* Data quality indicator */}
      {loadingSamples && (
        <Alert variant="info">⏳ Cargando datos de segundo a segundo desde Strava…</Alert>
      )}
      {!loadingSamples && hasStreams && (
        <Alert variant="info">
          ✓ <strong>Datos de máxima precisión:</strong> Gráficos con todos los datos de segundo a segundo desde
          Strava (~{realSamples?.length?.toLocaleString()} puntos por actividad).
        </Alert>
      )}
      {!loadingSamples && !hasStreams && (
        <Alert variant="info">
          📊 <strong>Sin datos de precisión todavía.</strong> Sincroniza esta actividad en{' '}
          <button
            onClick={async () => {
              const res = await fetch('/api/activities/sync-unsynced', { method: 'POST' })
              if (res.ok) location.reload()
            }}
            className="underline hover:font-semibold"
          >
            el botón de sincronización
          </button>{' '}
          para ver gráficos de máxima precisión.
        </Alert>
      )}

      {/* Summary Stats */}
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Distancia"
          value={activity.distance_meters ? `${(activity.distance_meters / 1000).toFixed(1)} km` : '—'}
        />
        <Stat
          label="Tiempo en movimiento"
          value={
            activity.moving_seconds
              ? `${Math.floor(activity.moving_seconds / 3600)}h ${Math.floor((activity.moving_seconds % 3600) / 60)}m`
              : '—'
          }
        />
        <Stat label="Pulso medio" value={activity.avg_hr ? `${activity.avg_hr} ppm` : '—'} />
        <Stat
          label="Potencia media"
          value={
            activity.avg_power
              ? `${Math.round(activity.avg_power)} W${activity.normalized_power ? ` (${Math.round(activity.normalized_power)} NP)` : ''}`
              : '—'
          }
        />
      </Card>

      {/* GPS Route */}
      {mapPoints.length > 1 && (
        <Card>
          <h3 className="mb-4 font-semibold">Ruta GPS</h3>
          <ActivityMap points={mapPoints} />
        </Card>
      )}

      {/* Heart Rate Time Series */}
      {hasStreams && activity.avg_hr && (
        <Card>
          <h3 className="mb-4 font-semibold">Pulso durante la salida</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seconds" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisTime} />
              <YAxis domain={numericDomain(timeSeries, 'hr', 5)} />
              <Tooltip
                formatter={(value) => {
                  if (typeof value === 'number') return `${Math.round(value)} ppm`
                  return value
                }}
              />
              <Area
                type="monotone"
                dataKey="hr"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#hrGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Power Time Series - Only if real power meter */}
      {hasStreams && activity.avg_power && activity.has_power_meter && (
        <Card>
          <h3 className="mb-4 font-semibold">Potencia durante la salida</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seconds" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisTime} />
              <YAxis domain={numericDomain(timeSeries, 'power', 20, true)} />
              <Tooltip
                formatter={(value) => {
                  if (typeof value === 'number') return `${Math.round(value)} W`
                  return value
                }}
              />
              <Area
                type="monotone"
                dataKey="power"
                stroke="#06b6d4"
                fillOpacity={1}
                fill="url(#powerGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Speed Time Series */}
      {hasStreams && (
      <Card>
        <h3 className="mb-4 font-semibold">Velocidad durante la salida</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={timeSeries}>
            <defs>
              <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="seconds" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisTime} />
            <YAxis label={{ value: 'km/h', angle: -90, position: 'insideLeft' }} domain={numericDomain(timeSeries, 'speed', 2, true)} />
            <Tooltip
              formatter={(value) => {
                if (typeof value === 'number') return `${value.toFixed(1)} km/h`
                return value
              }}
            />
            <Area
              type="monotone"
              dataKey="speed"
              stroke="#8b5cf6"
              fillOpacity={1}
              fill="url(#speedGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      )}

      {/* Elevation profile */}
      {hasStreams && hasElevationData && (
        <Card>
          <h3 className="mb-4 font-semibold">Perfil de elevación</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeSeries}>
              <defs>
                <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#64748b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#64748b" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seconds" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisTime} />
              <YAxis label={{ value: 'm', angle: -90, position: 'insideLeft' }} domain={numericDomain(timeSeries, 'elevation', 10)} />
              <Tooltip
                formatter={(value) => {
                  if (typeof value === 'number') return `${Math.round(value)} m`
                  return value
                }}
              />
              <Area
                type="monotone"
                dataKey="elevation"
                stroke="#64748b"
                fillOpacity={1}
                fill="url(#elevationGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Temperature - Only if available */}
      {hasStreams && realSamples?.some((s) => s.temperature !== null) && (
        <Card>
          <h3 className="mb-4 font-semibold">Temperatura corporal</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seconds" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisTime} />
              <YAxis label={{ value: '°C', angle: -90, position: 'insideLeft' }} domain={numericDomain(timeSeries, 'temperature', 1)} />
              <Tooltip
                formatter={(value) => {
                  if (typeof value === 'number') return `${value.toFixed(1)}°C`
                  return value
                }}
              />
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="#f97316"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Heart Rate Zones */}
      {displayHrZones && (
        <Card>
          <h3 className="mb-4 font-semibold">Distribución de zonas de pulso</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={displayHrZones}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip formatter={(value) => `${Math.round(value as number)}%`} />
              <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                {displayHrZones.map((entry) => (
                  <Cell key={entry.zone} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {displayHrZones.map((zone) => (
              <div key={zone.zone} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded" style={{ backgroundColor: zone.color }} />
                  <span className="font-medium">{zone.label}</span>
                </div>
                <span className="text-slate-600">{zone.range}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Power Zones */}
      {displayPowerZones && (
        <Card>
          <h3 className="mb-4 font-semibold">Distribución de zonas de potencia</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={displayPowerZones}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip formatter={(value) => `${Math.round(value as number)}%`} />
              <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                {displayPowerZones.map((entry) => (
                  <Cell key={entry.zone} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {displayPowerZones.map((zone) => (
              <div key={zone.zone} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded" style={{ backgroundColor: zone.color }} />
                  <span className="font-medium">{zone.label}</span>
                </div>
                <span className="text-slate-600">{zone.range}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cadence and Speed */}
      {hasStreams && (activity.avg_cadence || activity.avg_speed) && (
        <Card>
          <h3 className="mb-4 font-semibold">Cadencia y velocidad</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seconds" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisTime} />
              <YAxis yAxisId="left" label={{ value: 'Cadencia (rpm)', angle: -90, position: 'insideLeft' }} domain={numericDomain(timeSeries, 'cadence', 5, true)} />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: 'Velocidad (km/h)', angle: 90, position: 'insideRight' }}
                domain={numericDomain(timeSeries, 'speed', 2, true)}
              />
              <Tooltip />
              <Legend />
              {activity.avg_cadence && (
                <Line yAxisId="left" type="monotone" dataKey="cadence" stroke="#f97316" isAnimationActive={false} />
              )}
              {activity.avg_speed && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="speed"
                  stroke="#10b981"
                  isAnimationActive={false}
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Additional Stats */}
      {(activity.elevation_gain_meters || activity.max_cadence || activity.max_speed) && (
        <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {activity.elevation_gain_meters && (
            <Stat label="Ascenso total" value={`${Math.round(activity.elevation_gain_meters)} m`} />
          )}
          {activity.avg_cadence && (
            <Stat label="Cadencia media" value={`${Math.round(activity.avg_cadence)} rpm`} />
          )}
          {activity.max_cadence && (
            <Stat label="Cadencia máxima" value={`${Math.round(activity.max_cadence)} rpm`} />
          )}
          {activity.avg_speed && (
            <Stat label="Velocidad media" value={`${(activity.avg_speed * 3.6).toFixed(1)} km/h`} />
          )}
          {activity.max_speed && (
            <Stat label="Velocidad máxima" value={`${(activity.max_speed * 3.6).toFixed(1)} km/h`} />
          )}
          {activity.training_load && (
            <Stat label="Carga de entrenamiento" value={`${Math.round(activity.training_load)}`} />
          )}
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
