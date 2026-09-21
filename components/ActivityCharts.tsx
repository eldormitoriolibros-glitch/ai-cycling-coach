'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, Alert } from '@/components/ui'
import { ActivityTimeline, type TimelinePoint } from '@/components/activity/ActivityTimeline'
import { AerobicDecoupling } from '@/components/activity/AerobicDecoupling'
import { PlannedVsDone } from '@/components/activity/PlannedVsDone'
import type { PlannedWorkout } from '@/lib/training/planned-vs-done'
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
  respiration_rate: number | null
  latitude: number | null
  longitude: number | null
}

type ChartPoint = TimelinePoint

type Props = {
  activity: ActivityRow & { maxHr?: number; ftp?: number }
  samples?: ActivitySample[]
  /** Rendered between the route map and the charts (details + lap blocks). */
  afterMap?: React.ReactNode
  /** Session this ride fulfilled, when the plan and the file are linked. */
  planned?: PlannedWorkout | null
}

/**
 * Process real activity samples into chart data. `maxHr`/`ftp` must be the same
 * profile-level values used to draw the zone boundaries, or the percentages
 * shown won't match the bands (this used to fall back to the ride's own peak
 * HR/a crude power guess, which skewed the distribution toward Z3/Z4).
 */
/** Speed threshold below which a sample counts as "stopped" (m/s ≈ 1.5 km/h). */
const STOPPED_SPEED_MS = 0.4

/**
 * Compress samples to "moving time" by removing stopped intervals and
 * re-indexing offset_seconds so charts show continuous riding without gaps.
 */
function compressToMovingTime(samples: ActivitySample[]): ActivitySample[] {
  if (!samples.length) return samples

  const sorted = [...samples].sort((a, b) => a.offset_seconds - b.offset_seconds)
  const result: ActivitySample[] = []
  let movingOffset = 0
  let prevOrigOffset = sorted[0].offset_seconds

  for (const s of sorted) {
    const gap = s.offset_seconds - prevOrigOffset
    const isMoving = s.speed !== null ? s.speed > STOPPED_SPEED_MS : true
    prevOrigOffset = s.offset_seconds

    if (isMoving) {
      movingOffset += gap > 0 ? Math.min(gap, 5) : 0
      result.push({ ...s, offset_seconds: movingOffset })
    }
  }

  return result
}

function processRealSamples(samples: ActivitySample[], maxHr: number | null, ftp: number | null) {
  if (!samples.length) return null

  // Zone calculations use ALL samples (including stopped) for accuracy
  const hrZones = countHrZones(
    samples.map((s) => s.heart_rate),
    maxHr
  )
  const pwrZones = countPowerZones(
    samples.map((s) => s.power),
    ftp
  )

  // Time-series charts use compressed (moving-only) data
  const moving = compressToMovingTime(samples)

  return {
    timeSeries: moving.map((s) => ({
      seconds: s.offset_seconds,
      hr: s.heart_rate,
      power: s.power,
      cadence: s.cadence,
      speed: s.speed === null ? null : s.speed * 3.6,
      elevation: s.elevation,
      temperature: s.temperature,
      respirationRate: s.respiration_rate,
    })),
    hrZones,
    pwrZones,
    hasHr: samples.some((s) => s.heart_rate !== null),
    hasPower: samples.some((s) => s.power !== null),
    hasCadence: samples.some((s) => s.cadence !== null),
  }
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
    'respirationRate',
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

type ZoneBar = { zone: string; label: string; range: string; color: string; value: number }

/**
 * Power and pulse zones share one card: same question ("¿en qué intensidad
 * estuve?"), so the athlete switches instead of scrolling past two charts.
 */
function ZoneDistribution({ power, hr }: { power: ZoneBar[] | null; hr: ZoneBar[] | null }) {
  const [tab, setTab] = useState<'power' | 'hr'>('power')

  const available: Array<'power' | 'hr'> = [
    ...(power ? (['power'] as const) : []),
    ...(hr ? (['hr'] as const) : []),
  ]
  if (!available.length) return null

  const activeTab = available.includes(tab) ? tab : available[0]
  const zones = (activeTab === 'power' ? power : hr) ?? []

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Distribución de zonas</h2>
        {available.length > 1 && (
          <div className="inline-flex rounded-lg border border-surface p-1">
            {available.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === key ? 'bg-accent-500 text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                {key === 'power' ? 'Potencia' : 'Pulso'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-background">
        {zones.map((zone) =>
          zone.value > 0 ? (
            <div
              key={zone.zone}
              className="h-full min-w-[2px]"
              style={{ width: `${zone.value}%`, backgroundColor: zone.color }}
              title={`${zone.zone} ${zone.label}: ${zone.value}%`}
            />
          ) : null
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {zones.map((zone) => (
          <li key={zone.zone} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ backgroundColor: zone.color }} />
              <span className="font-medium">{zone.zone}</span>
              <span className="truncate text-muted">{zone.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {zone.value}% · {zone.range}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ActivityCharts({ activity, samples: initialSamples, afterMap, planned }: Props) {
  const [realSamples, setRealSamples] = useState<ActivitySample[] | null>(
    initialSamples && initialSamples.length > 0 ? initialSamples : null
  )
  const [loadingSamples, setLoadingSamples] = useState(!initialSamples?.length)

  // Load samples from API if not provided
  useEffect(() => {
    if (initialSamples?.length) return

    let cancelled = false
    const loadSamples = async () => {
      try {
        const res = await fetch(`/api/activities/${activity.id}/samples`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setRealSamples(data)
          }
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
  }, [activity.id, initialSamples])

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

  return (
    <div className="space-y-4">
      {loadingSamples && (
        <Alert variant="info">⏳ Cargando datos de segundo a segundo…</Alert>
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

      {/* GPS Route */}
      {mapPoints.length > 1 && (
        <Card>
          <h3 className="mb-4 font-semibold">Ruta GPS</h3>
          <ActivityMap points={mapPoints} />
        </Card>
      )}

      {afterMap}

      {planned && chartData && chartData.timeSeries.length > 1 && (
        <PlannedVsDone
          workout={planned}
          points={chartData.timeSeries}
          ftp={resolvedFtp}
          maxHr={resolvedMaxHr}
        />
      )}

      {hasStreams && <AerobicDecoupling samples={realSamples!} ftp={resolvedFtp} />}

      {hasStreams && timeSeries.length > 1 && <ActivityTimeline points={timeSeries} />}

      <ZoneDistribution power={displayPowerZones} hr={displayHrZones} />
    </div>
  )
}
