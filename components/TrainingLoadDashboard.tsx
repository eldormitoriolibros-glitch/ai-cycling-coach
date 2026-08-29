'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'

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
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function TrainingLoadDashboard({
  days = 42,
  compact = false,
  showStats = true,
}: {
  days?: number
  compact?: boolean
  showStats?: boolean
}) {
  const [data, setData] = useState<LoadData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/training/load-history?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return compact ? (
      <p className="text-sm text-muted animate-pulse">Cargando gráficos…</p>
    ) : (
      <Card><p className="text-sm text-muted animate-pulse">Cargando datos de carga...</p></Card>
    )
  }
  if (!data || !data.loadTimeline.length) return null

  const timeline = data.loadTimeline
  const lastPoint = timeline[timeline.length - 1]
  const chartHeight = compact ? 120 : 200

  const last28 = timeline.slice(-28).map((p) => ({
    date: formatDateShort(p.date),
    fullDate: p.date,
    load: p.dailyLoad,
  }))

  const fitnessData = timeline.map((p) => ({
    date: formatDate(p.date),
    fullDate: p.date,
    fitness: p.chronicLoad != null ? Math.round(p.chronicLoad) : null,
    fatigue: p.acuteLoad != null ? Math.round(p.acuteLoad) : null,
    form: p.form != null ? Math.round(p.form) : null,
  }))

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

  return (
    <div className={compact ? 'grid gap-3 lg:grid-cols-3' : 'space-y-4'}>
      <div className={compact ? chartShell : undefined}>
        {!compact && (
          <Card>
            <h3 className="mb-1 font-semibold">Carga de ejercicio diaria</h3>
            <p className="mb-3 text-xs text-muted">Últimos 28 días</p>
            <DailyLoadChart data={last28} dailyActivities={data.dailyActivities} height={chartHeight} />
          </Card>
        )}
        {compact && (
          <>
            <h3 className="mb-1 text-xs font-semibold">Carga diaria</h3>
            <p className="mb-2 text-[10px] text-muted">28 días</p>
            <DailyLoadChart data={last28} dailyActivities={data.dailyActivities} height={chartHeight} compact />
          </>
        )}
      </div>

      <div className={compact ? chartShell : undefined}>
        {!compact ? (
          <Card>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="font-semibold">Carga de entreno (7 días)</h3>
              <span className="text-xs text-muted">Rango óptimo: {optimalLow}–{optimalHigh}</span>
            </div>
            <RollingLoadChart data={rollingData} optimalLow={optimalLow} optimalHigh={optimalHigh} height={220} />
          </Card>
        ) : (
          <>
            <h3 className="mb-1 text-xs font-semibold">Carga 7 días</h3>
            <p className="mb-2 text-[10px] text-muted">Óptimo {optimalLow}–{optimalHigh}</p>
            <RollingLoadChart data={rollingData} optimalLow={optimalLow} optimalHigh={optimalHigh} height={chartHeight} compact />
          </>
        )}
      </div>

      <div className={compact ? chartShell : undefined}>
        {!compact ? (
          <Card>
            <h3 className="mb-1 font-semibold">Fitness vs Fatiga</h3>
            <p className="mb-3 text-xs text-muted">
              CTL (Fitness) · ATL (Fatiga) · TSB (Forma) — {timeline.length} días
            </p>
            <FitnessFatigueChart data={fitnessData} height={250} compact={false} />
            {showStats && lastPoint && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Fitness (CTL)" value={lastPoint.chronicLoad} color="text-blue-600" />
                <MiniStat label="Fatiga (ATL)" value={lastPoint.acuteLoad} color="text-red-500" />
                <MiniStat label="Forma (TSB)" value={lastPoint.form} color="text-green-600" />
                <MiniStat label="Rampa 7d" value={lastPoint.rampRate} color="text-slate-600" />
              </div>
            )}
          </Card>
        ) : (
          <>
            <h3 className="mb-1 text-xs font-semibold">Fitness vs Fatiga</h3>
            <p className="mb-2 text-[10px] text-muted">CTL · ATL · TSB</p>
            <FitnessFatigueChart data={fitnessData} height={chartHeight} compact />
          </>
        )}
      </div>
    </div>
  )
}

function DailyLoadChart({
  data,
  dailyActivities,
  height,
  compact = false,
}: {
  data: Array<{ date: string; fullDate: string; load: number }>
  dailyActivities: LoadData['dailyActivities']
  height: number
  compact?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={compact ? 6 : 12}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: compact ? 8 : 10 }}
          interval={Math.floor(data.length / (compact ? 4 : 7))}
        />
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
                  <p key={i} className="text-muted">{a.title ?? a.sport} — {Math.round(a.load ?? 0)}</p>
                ))}
              </div>
            )
          }}
        />
        <Bar dataKey="load" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function RollingLoadChart({
  data,
  optimalLow,
  optimalHigh,
  height,
  compact = false,
}: {
  data: Array<{ date: string; rolling7d: number }>
  optimalLow: number
  optimalHigh: number
  height: number
  compact?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: compact ? 8 : 10 }}
          interval={Math.floor(data.length / (compact ? 4 : 6))}
        />
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
          stroke="#e2e8f0"
          strokeWidth={compact ? 1.5 : 2}
          dot={compact ? false : { r: 3, fill: '#e2e8f0', stroke: '#94a3b8' }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function FitnessFatigueChart({
  data,
  height,
  compact = false,
}: {
  data: Array<{ date: string; fitness: number | null; fatigue: number | null; form: number | null }>
  height: number
  compact?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: compact ? 8 : 10 }}
          interval={Math.floor(data.length / (compact ? 4 : 6))}
        />
        <YAxis tick={{ fontSize: compact ? 8 : 10 }} width={compact ? 28 : undefined} />
        <Tooltip />
        {!compact && (
          <Legend
            formatter={(value) => {
              const labels: Record<string, string> = {
                fitness: 'Fitness (CTL)',
                fatigue: 'Fatiga (ATL)',
                form: 'Forma (TSB)',
              }
              return labels[value] ?? value
            }}
          />
        )}
        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="fitness" stroke="#3b82f6" strokeWidth={compact ? 1.5 : 2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="fatigue" stroke="#ef4444" strokeWidth={compact ? 1.5 : 2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="form" stroke="#22c55e" strokeWidth={compact ? 1.5 : 2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
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
