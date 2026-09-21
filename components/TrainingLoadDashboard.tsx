'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui'
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection'
import { PolarizationChart } from '@/components/dashboard/PolarizationChart'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import { assessForm, bandTone, type BandId } from '@/lib/training/form-status'
import { startOfWeek } from '@/lib/training/dates'

type LoadPoint = {
  date: string
  dailyLoad: number
  acuteLoad: number | null
  chronicLoad: number | null
  form: number | null
  rampRate: number | null
}

type DailyActivity = {
  total: number
  activities: Array<{ id: string; title: string; load: number; sport: string }>
}

type LoadData = {
  loadTimeline: LoadPoint[]
  dailyActivities: Record<string, DailyActivity>
  goal?: { date: string; label: string | null; kind: string } | null
}

const RANGE_OPTIONS = [
  { days: 14, label: '2 sem' },
  { days: 28, label: '4 sem' },
  { days: 42, label: '6 sem' },
  { days: 90, label: '3 meses' },
  { days: 180, label: '6 meses' },
  { days: 365, label: '1 año' },
  { days: 730, label: '2 años' },
  { days: 0, label: 'Todo' },
] as const

const RANGE_KEY = 'trainer:load-range-days'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function rangeLabel(days: number): string {
  return RANGE_OPTIONS.find((r) => r.days === days)?.label ?? `${days} días`
}

export function TrainingLoadDashboard({
  days: initialDays = 28,
  compact = false,
  showStats = true,
  allowRangeSelect = true,
  collapsible = false,
  featured = 'daily',
}: {
  days?: number
  compact?: boolean
  showStats?: boolean
  allowRangeSelect?: boolean
  collapsible?: boolean
  featured?: 'daily' | 'rolling' | 'fitness'
}) {
  const [days, setDays] = useState(initialDays)
  const [data, setData] = useState<LoadData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!allowRangeSelect) return
    const stored = Number(localStorage.getItem(RANGE_KEY))
    if (RANGE_OPTIONS.some((r) => r.days === stored)) setDays(stored)
  }, [allowRangeSelect])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/training/load-history?days=${days}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const pickRange = (next: number) => {
    setDays(next)
    if (allowRangeSelect) localStorage.setItem(RANGE_KEY, String(next))
  }

  const rangePicker = allowRangeSelect ? (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Rango</p>
      <div className="no-scrollbar -mx-1 max-w-full overflow-x-auto px-1">
        <div className="inline-flex gap-1 rounded-lg border border-surface p-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => pickRange(r.days)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                days === r.days
                  ? 'bg-accent-500 text-white'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null

  const pending = compact ? (
    <p className="text-sm text-muted animate-pulse">Cargando gráficos…</p>
  ) : (
    <Card>
      <p className="text-sm text-muted animate-pulse">Cargando datos de carga...</p>
    </Card>
  )
  const empty = <p className="text-sm text-muted">Sin datos de carga en este rango.</p>
  const ready = Boolean(data && data.loadTimeline.length)

  const timeline = data?.loadTimeline ?? []
  const lastPoint = timeline[timeline.length - 1]
  const chartHeight = compact ? 148 : 200
  const tickEvery = Math.max(1, Math.floor(timeline.length / (compact ? 4 : 7)))

  const dailyData = timeline.map((p) => ({
    date: formatDateShort(p.date),
    fullDate: p.date,
    load: p.dailyLoad,
  }))

  const fitnessDaily = timeline.map((p) => ({
    date: formatDate(p.date),
    fullDate: p.date,
    fitness: p.chronicLoad != null ? Math.round(p.chronicLoad) : null,
    fatigue: p.acuteLoad != null ? Math.round(p.acuteLoad) : null,
    form: p.form != null ? Math.round(p.form) : null,
  }))
  const weeklyFitness = timeline.length > 90
  const fitnessData = weeklyFitness ? toWeeklyFitness(fitnessDaily) : fitnessDaily
  const fitnessTicks = weeklyFitness
    ? Math.max(0, Math.floor(fitnessData.length / (compact ? 4 : 8)) - 1)
    : tickEvery

  const rollingData = timeline.map((p, i) => {
    const window = timeline.slice(Math.max(0, i - 6), i + 1)
    const sum = window.reduce((s, w) => s + w.dailyLoad, 0)
    return {
      date: formatDate(p.date),
      fullDate: p.date,
      rolling7d: Math.round(sum),
    }
  })

  const allRolling = rollingData.map((r) => r.rolling7d).filter((v) => v > 0)
  const avgRolling = allRolling.length > 0 ? allRolling.reduce((a, b) => a + b, 0) / allRolling.length : 0
  const optimalLow = Math.round(avgRolling * 0.8)
  const optimalHigh = Math.round(avgRolling * 1.2)

  const chartShell = compact
    ? 'rounded-lg border border-surface p-3'
    : 'rounded-lg border border-surface p-0 border-0'

  const dailyChart = compact ? (
    <>
      <h3 className="mb-1 text-xs font-semibold">Carga diaria</h3>
      <p className="mb-2 text-[10px] text-muted">{rangeLabel(days)}</p>
      <DailyLoadChart
        data={dailyData}
        dailyActivities={data?.dailyActivities ?? {}}
        height={chartHeight}
        tickEvery={tickEvery}
        compact
      />
    </>
  ) : (
    <Card>
      <h3 className="mb-1 font-semibold">Carga de ejercicio diaria</h3>
      <p className="mb-3 text-xs text-muted">{rangeLabel(days)}</p>
      <DailyLoadChart
        data={dailyData}
        dailyActivities={data?.dailyActivities ?? {}}
        height={chartHeight}
        tickEvery={tickEvery}
      />
    </Card>
  )

  const rollingChart = compact ? (
    <>
      <h3 className="mb-1 text-xs font-semibold">Carga 7 días</h3>
      <p className="mb-2 text-[10px] text-muted">
        Óptimo {optimalLow}–{optimalHigh}
      </p>
      <RollingLoadChart
        data={rollingData}
        optimalLow={optimalLow}
        optimalHigh={optimalHigh}
        height={chartHeight}
        tickEvery={tickEvery}
        compact
      />
    </>
  ) : (
    <Card>
      <div className="mb-3 flex items-baseline gap-3">
        <h3 className="font-semibold">Carga de entreno (7 días)</h3>
        <span className="text-xs text-muted">
          Rango óptimo: {optimalLow}–{optimalHigh}
        </span>
      </div>
      <RollingLoadChart
        data={rollingData}
        optimalLow={optimalLow}
        optimalHigh={optimalHigh}
        height={220}
        tickEvery={tickEvery}
      />
    </Card>
  )

  const goalDate = data?.goal?.date ?? null
  const goalNote = goalDate
    ? ` · objetivo ${formatDate(goalDate)}${data?.goal?.label ? `: ${data.goal.label}` : ''}`
    : ''

  const fitnessChart = compact ? (
    <>
      <h3 className="mb-1 text-xs font-semibold">Fitness, fatiga y forma</h3>
      <p className="mb-2 text-[10px] text-muted">
        {weeklyFitness ? 'Por semana' : 'Líneas CTL y ATL · barras TSB'}
      </p>
      <FitnessFatigueChart
        data={fitnessData}
        height={chartHeight}
        tickEvery={fitnessTicks}
        goalDate={goalDate}
        compact
      />
    </>
  ) : (
    <Card>
      <h3 className="mb-1 font-semibold">Fitness, fatiga y forma</h3>
      <p className="mb-3 text-xs text-muted">
        Fitness (CTL) y fatiga (ATL) como líneas, forma (TSB) como barras
        {weeklyFitness
          ? ` — un punto por semana (${fitnessData.length} semanas)`
          : ` — ${timeline.length} días`}
        {goalNote}
      </p>
      <FitnessFatigueChart
        data={fitnessData}
        height={250}
        tickEvery={fitnessTicks}
        goalDate={goalDate}
      />
      <FormBandLegend />
      {showStats && lastPoint && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Fitness (CTL)" value={lastPoint.chronicLoad} color="text-blue-600" />
          <MiniStat label="Fatiga (ATL)" value={lastPoint.acuteLoad} color="text-red-500" />
          <MiniStat
            label="Forma (TSB)"
            value={lastPoint.form}
            color={bandTone(assessForm(lastPoint.form != null ? Math.round(lastPoint.form) : null).band).text}
          />
          <MiniStat label="Rampa 7d" value={lastPoint.rampRate} color="text-muted" />
        </div>
      )}
    </Card>
  )

  const featuredChart =
    featured === 'rolling' ? rollingChart : featured === 'fitness' ? fitnessChart : dailyChart

  const polarization = compact ? (
    <PolarizationChart compact days={days} />
  ) : (
    <Card>
      <PolarizationChart days={days} />
    </Card>
  )

  const allCharts = (
    <div className={compact ? 'grid gap-3 lg:grid-cols-3' : 'space-y-4'}>
      <div className={compact ? chartShell : undefined}>{dailyChart}</div>
      <div className={compact ? chartShell : undefined}>{rollingChart}</div>
      <div className={compact ? chartShell : undefined}>{fitnessChart}</div>
    </div>
  )

  const summary = !ready ? (loading ? pending : empty) : <div className={chartShell}>{featuredChart}</div>

  const body = (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {rangePicker}
      {polarization}
      {!ready ? (loading ? pending : empty) : allCharts}
    </div>
  )

  if (collapsible) {
    return (
      <CollapsibleSection title="Gráficos de carga" summaryInteractive summary={summary}>
        {body}
      </CollapsibleSection>
    )
  }

  return body
}

function DailyLoadChart({
  data,
  dailyActivities,
  height,
  tickEvery,
  compact = false,
}: {
  data: Array<{ date: string; fullDate: string; load: number }>
  dailyActivities: LoadData['dailyActivities']
  height: number
  tickEvery: number
  compact?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={compact ? Math.max(2, Math.min(6, 180 / Math.max(data.length, 1))) : 12}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: compact ? 8 : 10 }} interval={tickEvery} />
        <YAxis tick={{ fontSize: compact ? 8 : 10 }} width={compact ? 28 : undefined} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            const acts = dailyActivities[d.fullDate]
            return (
              <div className="rounded bg-white dark:bg-slate-800 shadow-lg border border-surface p-2 text-xs">
                <p className="font-semibold">{d.date}</p>
                <p>Carga: {d.load}</p>
                {acts?.activities.map((a, i) => (
                  <p key={i} className="text-muted">
                    {a.title ?? a.sport} — {Math.round(a.load ?? 0)}
                  </p>
                ))}
              </div>
            )
          }}
        />
        <Bar dataKey="load" fill="rgb(var(--accent-500))" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function RollingLoadChart({
  data,
  optimalLow,
  optimalHigh,
  height,
  tickEvery,
  compact = false,
}: {
  data: Array<{ date: string; rolling7d: number }>
  optimalLow: number
  optimalHigh: number
  height: number
  tickEvery: number
  compact?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: compact ? 8 : 10 }} interval={tickEvery} />
        <YAxis tick={{ fontSize: compact ? 8 : 10 }} width={compact ? 28 : undefined} />
        <Tooltip formatter={(value) => [Math.round(Number(value)), 'Carga 7d']} />
        <ReferenceArea
          y1={optimalLow}
          y2={optimalHigh}
          fill="#84cc16"
          fillOpacity={0.15}
          stroke="#84cc16"
          strokeOpacity={0.3}
          strokeDasharray="4 2"
        />
        <ReferenceLine y={optimalLow} stroke="#84cc16" strokeDasharray="4 2" strokeOpacity={0.5} />
        <ReferenceLine y={optimalHigh} stroke="#84cc16" strokeDasharray="4 2" strokeOpacity={0.5} />
        <Line
          type="monotone"
          dataKey="rolling7d"
          stroke="#94a3b8"
          strokeWidth={compact ? 1.5 : 2}
          dot={compact ? false : { r: 3, fill: '#94a3b8', stroke: '#64748b' }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

type FitnessPoint = {
  date: string
  fullDate: string
  fitness: number | null
  fatigue: number | null
  form: number | null
}

/** One point per ISO week — the last day. CTL/ATL already move slowly. */
function toWeeklyFitness(data: FitnessPoint[]): FitnessPoint[] {
  const lastByWeek = new Map<string, FitnessPoint>()
  for (const point of data) {
    lastByWeek.set(startOfWeek(point.fullDate), point)
  }
  return [...lastByWeek.entries()].map(([week, point]) => ({
    ...point,
    date: formatDate(week),
    fullDate: week,
  }))
}

/**
 * Performance Management Chart: fitness and fatigue as lines, form as bars
 * coloured by the same bands the "Estado de forma" meter uses, so a taper
 * reads as the bars climbing out of the red before the target date.
 */
function FitnessFatigueChart({
  data,
  height,
  tickEvery,
  compact = false,
  goalDate,
}: {
  data: FitnessPoint[]
  height: number
  tickEvery: number
  compact?: boolean
  goalDate?: string | null
}) {
  const goalKey = goalDate ? startOfWeek(goalDate) : null
  const goalPoint = goalKey
    ? data.find((point) => point.fullDate === goalDate || point.fullDate === goalKey)
    : undefined

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: compact ? 8 : 10 }}
          interval={tickEvery}
          minTickGap={16}
        />
        <YAxis yAxisId="load" tick={{ fontSize: compact ? 8 : 10 }} width={compact ? 28 : 40} />
        <YAxis
          yAxisId="form"
          orientation="right"
          tick={{ fontSize: compact ? 8 : 10 }}
          width={compact ? 26 : 36}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as (typeof data)[number]
            const assessment = assessForm(point.form)
            return (
              <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                <p className="mb-1 font-medium text-muted">{label}</p>
                <p>Fitness (CTL): {point.fitness ?? '—'}</p>
                <p>Fatiga (ATL): {point.fatigue ?? '—'}</p>
                <p className={bandTone(assessment.band).text}>
                  Forma (TSB): {point.form ?? '—'} · {assessment.bandLabel}
                </p>
              </div>
            )
          }}
        />
        {goalPoint && (
          <ReferenceLine
            yAxisId="load"
            x={goalPoint.date}
            stroke="rgb(var(--accent-500))"
            strokeDasharray="4 3"
            label={{
              value: 'objetivo',
              position: 'insideTopRight',
              fontSize: 10,
              fill: 'rgb(var(--accent-500))',
            }}
          />
        )}
        <ReferenceLine yAxisId="form" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
        <Bar
          yAxisId="form"
          dataKey="form"
          isAnimationActive={false}
          maxBarSize={data.length > 40 ? 8 : compact ? 6 : 14}
        >
          {data.map((point) => (
            <Cell
              key={point.fullDate}
              fill={bandTone(assessForm(point.form).band).hex}
              fillOpacity={0.55}
            />
          ))}
        </Bar>
        <Line
          yAxisId="load"
          type="monotone"
          dataKey="fitness"
          stroke="#3b82f6"
          strokeWidth={compact ? 1.5 : 2.2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          yAxisId="load"
          type="monotone"
          dataKey="fatigue"
          stroke="#ef4444"
          strokeWidth={compact ? 1.5 : 1.8}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

const FORM_BANDS: Array<{ band: BandId; label: string }> = [
  { band: 'very_low', label: '< −30 riesgo' },
  { band: 'low', label: '−30 a −10 cargado' },
  { band: 'normal', label: '−10 a +5 normal' },
  { band: 'high', label: '+5 a +20 fresco' },
  { band: 'very_high', label: '> +20 muy fresco' },
]

function FormBandLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: '#3b82f6' }} />
        Fitness
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: '#ef4444' }} />
        Fatiga
      </span>
      <span className="text-muted/60">|</span>
      <span>Barras = forma:</span>
      {FORM_BANDS.map(({ band, label }) => (
        <span key={band} className="inline-flex items-center gap-1">
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: bandTone(band).hex, opacity: 0.75 }}
          />
          {label}
        </span>
      ))}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="rounded-lg border border-surface p-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value != null ? Math.round(value) : '—'}</p>
    </div>
  )
}
