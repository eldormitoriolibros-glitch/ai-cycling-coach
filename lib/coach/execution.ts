/**
 * Pure helpers for coach context formatting.
 * No DB, no server-only imports. Returns arrays of text lines (no trailing blank lines).
 */
import { addDays, localDateKey } from '@/lib/training/dates'
import { formatDuration } from '@/lib/utils'
import type { PowerSummary } from '@/lib/training/ftp'
import { TEMPLATES } from '@/lib/training/planner'

export type LoadPoint = {
  date: string
  daily_load: number | null
  chronic_load: number | null
  acute_load: number | null
  form: number | null
  ramp_rate: number | null
}

export type WorkoutLite = {
  scheduled_date: string
  title: string | null
  workout_type: string | null
  duration_minutes: number | null
  status: string
  target_zone: string | null
  target_power: number | null
  target_hr: number | null
}

export type ActivityLite = {
  start_time: string
  title: string | null
  sport_type: string | null
  moving_seconds: number | null
  avg_power: number | null
  normalized_power: number | null
  intensity_factor: number | null
  training_load: number | null
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/d' : Math.round(value).toString()
}

/** formatLoadSeries(points, today) */
export function formatLoadSeries(points: LoadPoint[] | null | undefined, today: string): string[] {
  const rows: string[] = []
  if (!points || points.length === 0) return ['sin datos suficientes']

  const byDate = new Map(points.map((p) => [p.date, p]))
  const start = addDays(today, -13)
  const days: string[] = []
  for (let d = 0; d < 14; d++) days.push(addDays(start, d))

  // Latest available row on or before today
  const available = points.slice().sort((a, b) => a.date.localeCompare(b.date))
  const latest = [...available].reverse().find((p) => p.date <= today) ?? null
  if (latest) {
    rows.push(
      `fecha: ${latest.date}, fitness/CTL: ${fmt(latest.chronic_load)}, fatiga/ATL: ${fmt(
        latest.acute_load
      )}, forma/TSB: ${fmt(latest.form)}, rampa 7d: ${fmt(latest.ramp_rate)}`
    )
  } else {
    rows.push('sin datos suficientes')
  }

  // 7-day sums
  const last7 = days.slice(7, 14)
  const prev7 = days.slice(0, 7)
  const sum = (ds: string[]) =>
    ds.reduce((s, d) => s + (Number(byDate.get(d)?.daily_load ?? 0) || 0), 0)
  const last7Sum = Math.round(sum(last7))
  const prev7Sum = Math.round(sum(prev7))
  rows.push(`últimos 7d: carga ${last7Sum} · 7d previos: ${prev7Sum}`)

  // daily list
  const daily = days.map((d) => Math.round(Number(byDate.get(d)?.daily_load ?? 0) || 0))
  rows.push(`carga diaria 14d: ${daily.join(', ')}`)

  return rows
}

/** formatPowerContext(summary, currentFtp) */
export function formatPowerContext(summary: PowerSummary | null | undefined, currentFtp: number | null | undefined): string[] {
  if (!summary) return ['sin curva de 90 días']
  if (!summary.curve || summary.curve.length === 0) return ['sin curva de 90 días']

  const want = new Map([
    [5, '5s'],
    [60, '1min'],
    [300, '5min'],
    [1200, '20min'],
    [3600, '60min'],
  ])

  const lines: string[] = []
  const parts: string[] = []
  for (const p of summary.curve) {
    const label = want.get(p.duration)
    if (!label) continue
    parts.push(`${label} ${p.watts}W (${p.date})`)
  }
  if (parts.length) lines.push(`MMP: ${parts.join(' · ')}`)

  if (summary.estimate) {
    const e = summary.estimate
    lines.push(
      `FTP estimado: ${e.ftp} W (${e.basisLabel} × ${e.factor}, ${e.date}) · ${summary.ridesWithPower} salidas con curva`
    )
    if (currentFtp && Math.abs(currentFtp - e.ftp) >= 5) {
      lines.push(`el estimado difiere del FTP cargado (${currentFtp} W)`)
    }
  }

  return lines
}

/** formatExecution(workouts, activities, timeZone, today) */
export function formatExecution(
  workouts: WorkoutLite[] | null | undefined,
  activities: ActivityLite[] | null | undefined,
  timeZone: string,
  today: string
): string[] {
  if (!workouts || workouts.length === 0) return ['- ninguna sesión prescripta en los últimos 7 días']

  const start = addDays(today, -6)
  const windowWorkouts = workouts
    .filter((w) => w.scheduled_date >= start && w.scheduled_date <= today)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  const actByDate = new Map<string, ActivityLite[]>()
  for (const a of activities ?? []) {
    const key = localDateKey(a.start_time, timeZone)
    const arr = actByDate.get(key) ?? []
    arr.push(a)
    actByDate.set(key, arr)
  }

  const out: string[] = []
  for (const w of windowWorkouts) {
    const prescribed = `${(w.title?.trim() || w.workout_type) ?? 'sesión'} ${w.duration_minutes ?? '?'} min${w.target_zone ? ' · ' + w.target_zone : ''}${
      w.target_power ? ` · ${w.target_power} W` : ''
    }`

    const acts = actByDate.get(w.scheduled_date) ?? []
    const activity = acts[0] ?? null

    let actual = 'sin salida'
    if (activity) {
      actual = `${formatDuration(activity.moving_seconds ?? 0)}`
      if (activity.avg_power) actual += ` · ${Math.round(activity.avg_power)} W`
      if (activity.normalized_power) actual += ` · NP ${Math.round(activity.normalized_power)} W`
      if (typeof activity.intensity_factor === 'number') actual += ` · IF ${activity.intensity_factor.toFixed(2)}`
      if (activity.training_load) actual += ` · carga ${Math.round(activity.training_load)}`
    } else {
      actual += ` (estado: ${w.status})`
    }

    // verdict
    let verdict = 'hecho'
    if (!activity) {
      verdict = 'sin salida'
    } else if (typeof activity.intensity_factor === 'number' && w.workout_type && (w.workout_type in TEMPLATES)) {
      const expected = (TEMPLATES as any)[w.workout_type].intensityFactor as number
      const delta = activity.intensity_factor! - expected
      if (delta < -0.08) verdict = 'más suave'
      else if (delta > 0.08) verdict = 'más duro'
      else verdict = 'como lo prescripto'
    } else if (w.duration_minutes && activity.moving_seconds) {
      const ratio = (activity.moving_seconds / 60) / w.duration_minutes
      if (ratio < 0.7) verdict = 'más suave'
      else if (ratio > 1.15) verdict = 'más duro'
      else verdict = 'como lo prescripto'
    } else {
      verdict = 'hecho'
    }

    out.push(`- ${w.scheduled_date} · ${prescribed} → ${actual} · ${verdict}`)
  }

  return out.length ? out : ['- ninguna sesión prescripta en los últimos 7 días']
}

