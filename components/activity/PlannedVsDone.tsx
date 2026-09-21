'use client'

import { useMemo } from 'react'
import { Crosshair } from 'lucide-react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui'
import { formatClock, type TimelinePoint } from '@/components/activity/ActivityTimeline'
import {
  bestPlanOffset,
  comparePlan,
  comparisonMetric,
  hasMeasurableWork,
  plannedPrescription,
  plannedSegments,
  shiftSegments,
  type PlannedWorkout,
  type SegmentResult,
} from '@/lib/training/planned-vs-done'
import { cn } from '@/lib/utils'

const MAX_DRAWN_POINTS = 900

const VERDICT = {
  below: { label: 'Por debajo', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  in: { label: 'En objetivo', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  above: { label: 'Por encima', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  na: { label: 'Sin dato', className: 'bg-slate-500/15 text-muted' },
}

function stride<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = Math.ceil(items.length / max)
  return items.filter((_, i) => i % step === 0)
}

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`
}

function bandLabel(low: number | null, high: number | null, unit: string): string {
  if (low == null) return '—'
  if (high == null) return `${low}+ ${unit}`
  return `${low}–${high} ${unit}`
}

/**
 * The prescription drawn as target bands with the real ride on top: the one
 * view that answers "did I do the session I was given?".
 */
export function PlannedVsDone({
  workout,
  points,
  ftp,
  maxHr,
}: {
  workout: PlannedWorkout
  points: TimelinePoint[]
  ftp: number | null
  maxHr: number | null
}) {
  const comparison = useMemo(() => {
    const metric = comparisonMetric({ points, ftp, maxHr })
    if (!metric) return null

    const { blocks, zone } = plannedPrescription(workout)
    if (!blocks.length) return null

    const segments = plannedSegments({
      blocks,
      metric,
      ftp,
      maxHr,
      targetPower: workout.target_power ?? null,
      fallbackZone: zone,
      rideSeconds: points[points.length - 1]?.seconds ?? null,
    })
    // Warmup and cooldown alone teach nothing; only show the overlay when
    // there is prescribed work to judge.
    if (!hasMeasurableWork(segments)) return null

    const aligned = shiftSegments(segments, bestPlanOffset({ segments, points, metric }))
    return comparePlan({ segments: aligned, points, metric })
  }, [workout, points, ftp, maxHr])

  const drawn = useMemo(() => stride(points, MAX_DRAWN_POINTS), [points])

  if (!comparison) return null

  const {
    metric,
    segments,
    results,
    adherence,
    plannedSeconds,
    plannedSecondsKnown,
    offsetSeconds,
    actualSeconds,
  } = comparison
  const planEndSeconds = offsetSeconds + plannedSeconds
  const overtime = plannedSecondsKnown && actualSeconds > planEndSeconds
  const unit = metric === 'power' ? 'W' : 'ppm'
  const metricKey = metric === 'power' ? 'power' : 'hr'
  const lineColor = metric === 'power' ? '#06b6d4' : '#ef4444'

  const actualMax = Math.max(
    ...drawn.map((p) => (metric === 'power' ? p.power : p.hr) ?? 0),
    ...segments.map((s) => s.high ?? s.low ?? 0)
  )
  const axisMax = Math.ceil((actualMax * 1.08) / 10) * 10 || 10
  const xMax = Math.max(plannedSeconds, actualSeconds)

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Plan vs. real</h2>
        <p className="text-xs text-muted">
          Las bandas son lo prescripto; la línea, lo que hiciste. El reloj es tiempo en movimiento.{' '}
          {metric === 'power'
            ? 'Comparado por vatios.'
            : 'Sin potencia: comparado por pulso, que tarda un par de minutos en llegar al esfuerzo real.'}
        </p>
        {offsetSeconds > 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2.5 py-1 text-[11px] font-medium text-accent-700 dark:text-accent-300">
            <Crosshair aria-hidden className="h-3 w-3" />
            La sesión no arrancó con la salida: el plan está alineado a los{' '}
            {formatMinutes(offsetSeconds)} de rodado.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Summary
          label="Adherencia"
          value={adherence == null ? '—' : `${adherence}%`}
          hint={adherence == null ? 'sin objetivo medible' : 'del bloque principal'}
        />
        <Summary
          label="Plan"
          value={plannedSecondsKnown ? formatMinutes(plannedSeconds) : '—'}
          hint={plannedSecondsKnown ? 'duración prescripta' : 'la sesión no fijó duración'}
        />
        <Summary
          label="Real"
          value={formatMinutes(actualSeconds)}
          hint={
            overtime
              ? `+${formatMinutes(actualSeconds - planEndSeconds)} después del plan`
              : 'en movimiento'
          }
        />
      </dl>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={drawn} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          {segments.map((segment, i) =>
            segment.low == null ? null : (
              <ReferenceArea
                key={`${segment.label}-${i}`}
                x1={segment.startSeconds}
                x2={segment.endSeconds}
                y1={segment.low}
                y2={segment.high ?? axisMax}
                fill={segment.color}
                fillOpacity={segment.role === 'work' || segment.role === 'steady' ? 0.3 : 0.14}
                stroke={segment.color}
                strokeOpacity={0.35}
              />
            )
          )}
          {offsetSeconds > 0 && (
            <ReferenceLine
              x={offsetSeconds}
              stroke="rgb(var(--muted-rgb))"
              strokeDasharray="4 3"
              label={{
                value: 'arranca el plan',
                position: 'insideTopLeft',
                fontSize: 10,
                fill: 'rgb(var(--muted-rgb))',
              }}
            />
          )}
          {plannedSecondsKnown && actualSeconds > planEndSeconds * 1.05 && (
            <ReferenceLine
              x={planEndSeconds}
              stroke="rgb(var(--muted-rgb))"
              strokeDasharray="4 3"
              label={{
                value: 'fin del plan',
                position: 'insideTopRight',
                fontSize: 10,
                fill: 'rgb(var(--muted-rgb))',
              }}
            />
          )}
          <XAxis
            dataKey="seconds"
            type="number"
            domain={[0, xMax]}
            tickFormatter={formatClock}
            tick={{ fontSize: 11 }}
          />
          <YAxis domain={[0, axisMax]} width={44} tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const value = payload[0]?.value
              const seconds = Number(label)
              const segment = segments.find(
                (s) => seconds >= s.startSeconds && seconds < s.endSeconds
              )
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-muted">{formatClock(seconds)}</p>
                  {typeof value === 'number' && (
                    <p className="font-semibold text-foreground">
                      {Math.round(value)} {unit}
                    </p>
                  )}
                  {segment && (
                    <p className="mt-1 text-muted">
                      {segment.label} · objetivo {bandLabel(segment.low, segment.high, unit)}
                    </p>
                  )}
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey={metricKey}
            stroke={lineColor}
            strokeWidth={1.6}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-surface text-muted">
              <th className="py-1 pr-2 font-medium">Bloque</th>
              <th className="py-1 pr-2 font-medium">Tiempo</th>
              <th className="py-1 pr-2 font-medium">Objetivo</th>
              <th className="py-1 pr-2 font-medium">Real</th>
              <th className="py-1 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row, i) => (
              <ResultRow key={`${row.segment.label}-${i}`} row={row} unit={unit} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Summary({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-surface bg-background p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-xl font-bold tabular-nums leading-tight">{value}</dd>
      <dd className="text-[10px] text-muted">{hint}</dd>
    </div>
  )
}

function ResultRow({ row, unit }: { row: SegmentResult; unit: string }) {
  const { segment, actual, verdict } = row
  const tone = VERDICT[verdict]
  return (
    <tr className="border-b border-surface/60">
      <td className="py-1 pr-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
          {segment.label}
        </span>
      </td>
      <td className="py-1 pr-2 tabular-nums text-muted">
        {formatMinutes(segment.endSeconds - segment.startSeconds)}
        {segment.inferredLength ? <span className="ml-1 text-[10px]">(según la salida)</span> : null}
      </td>
      <td className="py-1 pr-2 tabular-nums text-muted">
        {bandLabel(segment.low, segment.high, unit)}
      </td>
      <td className="py-1 pr-2 font-semibold tabular-nums text-foreground">
        {actual == null ? '—' : `${actual} ${unit}`}
      </td>
      <td className="py-1">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', tone.className)}>
          {tone.label}
        </span>
      </td>
    </tr>
  )
}
