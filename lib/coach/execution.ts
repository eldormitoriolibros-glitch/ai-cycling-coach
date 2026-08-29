/**
 * Pure helpers for coach context formatting.
 * No DB, no server-only imports. Returns arrays of text lines (no trailing blank lines).
 */
import { addDays, dayOfWeek, localDateKey } from '@/lib/training/dates'
import { formatDuration } from '@/lib/utils'
import type { PowerSummary } from '@/lib/training/ftp'
import { TEMPLATES } from '@/lib/training/planner2'

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

/** Weeks of history the coach uses to see full 4-week blocks (3 mesocycles). */
export const CYCLE_LOOKBACK_WEEKS = 12
export const BLOCK_LENGTH_WEEKS = 4

export type CycleActivity = {
  start_time: string
  distance_meters: number | null
  moving_seconds: number | null
  duration_seconds: number | null
  training_load: number | null
}

export type CyclePlanWeek = {
  start_date: string
  emphasis: string | null
  block_position: number | null
}

/** Monday (`YYYY-MM-DD`) of the ISO-style week that contains `date`. */
export function mondayOf(date: string): string {
  const dow = dayOfWeek(date)
  const offset = dow === 0 ? 6 : dow - 1
  return addDays(date, -offset)
}

/**
 * Compact lun–dom rollup so the coach can place rest weeks.
 *
 * A week is "liviana" when its load is below 70% of the mean of the previous
 * three weeks that had load. After three consecutive loading weeks the next
 * one should be recovery.
 *
 * @example
 * formatCycleHistory(
 *   [{ date: '2026-08-24', daily_load: 80, chronic_load: 50, acute_load: 60, form: -10, ramp_rate: 2 }],
 *   [{ start_time: '2026-08-25T10:00:00Z', distance_meters: 40000, moving_seconds: 5400, duration_seconds: 5400, training_load: 80 }],
 *   'America/Argentina/Buenos_Aires',
 *   '2026-08-29'
 * )[0]
 * // '## Ciclos (12 semanas, lun–dom)'
 */
export function formatCycleHistory(
  load: LoadPoint[] | null | undefined,
  activities: CycleActivity[] | null | undefined,
  timeZone: string,
  today: string,
  planWeeks: CyclePlanWeek[] | null | undefined = []
): string[] {
  const thisMonday = mondayOf(today)
  const weekStarts: string[] = []
  for (let i = CYCLE_LOOKBACK_WEEKS - 1; i >= 0; i--) {
    weekStarts.push(addDays(thisMonday, -7 * i))
  }

  const loadByDate = new Map((load ?? []).map((p) => [p.date, p]))
  const planByMonday = new Map((planWeeks ?? []).map((w) => [mondayOf(w.start_date), w]))

  const actsByWeek = new Map<string, CycleActivity[]>()
  for (const a of activities ?? []) {
    const key = mondayOf(localDateKey(a.start_time, timeZone))
    const arr = actsByWeek.get(key) ?? []
    arr.push(a)
    actsByWeek.set(key, arr)
  }

  type WeekRow = {
    start: string
    end: string
    rides: number
    km: number
    seconds: number
    load: number
    ctl: number | null
    tsb: number | null
    emphasis: string | null
    position: number | null
  }

  const rows: WeekRow[] = weekStarts.map((start) => {
    const end = addDays(start, 6)
    let dailySum = 0
    let ctl: number | null = null
    let tsb: number | null = null
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, d)
      const point = loadByDate.get(key)
      if (!point) continue
      dailySum += Number(point.daily_load ?? 0) || 0
      if (point.chronic_load != null) ctl = point.chronic_load
      if (point.form != null) tsb = point.form
    }

    const weekActs = actsByWeek.get(start) ?? []
    const actLoad = weekActs.reduce((s, a) => s + (a.training_load ?? 0), 0)
    const plan = planByMonday.get(start)

    return {
      start,
      end,
      rides: weekActs.length,
      km: weekActs.reduce((s, a) => s + (a.distance_meters ?? 0), 0) / 1000,
      seconds: weekActs.reduce((s, a) => s + (a.moving_seconds ?? a.duration_seconds ?? 0), 0),
      load: Math.round(dailySum > 0 ? dailySum : actLoad),
      ctl,
      tsb,
      emphasis: plan?.emphasis ?? null,
      position: plan?.block_position ?? null,
    }
  })

  const withLoad = rows.filter((r) => r.load > 0 || r.rides > 0)
  if (!withLoad.length) return ['sin datos suficientes para armar ciclos']

  const lightFlags = rows.map((row, i) => {
    const prev = rows.slice(Math.max(0, i - 3), i).filter((r) => r.load > 0)
    if (prev.length < 2 || row.load <= 0) return row.load <= 0 && row.rides === 0
    const mean = prev.reduce((s, r) => s + r.load, 0) / prev.length
    return row.load < mean * 0.7
  })

  let consecutiveLoading = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].load <= 0 && rows[i].rides === 0) continue
    if (lightFlags[i]) break
    consecutiveLoading++
  }

  const lastLight = [...rows].reverse().find((r, idx) => {
    const i = rows.length - 1 - idx
    return lightFlags[i] && (r.load > 0 || r.rides > 0)
  })

  const lines: string[] = [
    '## Ciclos (12 semanas, lun–dom)',
    'Cada ciclo es de 4 semanas (3 de carga + 1 de descarga). Usá esto para saber cuándo programar descanso.',
  ]

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.load <= 0 && r.rides === 0) continue
    const hours = r.seconds > 0 ? `${Math.floor(r.seconds / 3600)}h ${Math.floor((r.seconds % 3600) / 60)}m` : '0h'
    const kmLabel = r.km >= 100 ? `${Math.round(r.km)} km` : `${r.km.toFixed(1)} km`
    const extras = [
      r.ctl != null ? `CTL ${Math.round(r.ctl)}` : null,
      r.tsb != null ? `TSB ${Math.round(r.tsb)}` : null,
      r.emphasis ? `plan: ${r.emphasis}${r.position ? ` (${r.position}/4)` : ''}` : null,
      lightFlags[i] ? 'liviana' : null,
    ].filter(Boolean)
    lines.push(
      `- ${r.start} a ${r.end.slice(8)}: ${r.rides} salidas · ${kmLabel} · ${hours} · carga ${r.load}${
        extras.length ? ` · ${extras.join(' · ')}` : ''
      }`
    )
  }

  const lastLightLabel = lastLight ? `${lastLight.start} a ${lastLight.end.slice(8)}` : 'ninguna en estas 12 semanas'
  lines.push(`semanas de carga seguidas desde la última liviana: ${consecutiveLoading}`)
  lines.push(`última semana liviana: ${lastLightLabel}`)

  if (consecutiveLoading >= 3) {
    lines.push(
      `sugerencia: van ${consecutiveLoading} semanas de carga. La próxima debería ser de descanso (ciclo de 4 semanas).`
    )
  } else if (consecutiveLoading === 2) {
    lines.push('sugerencia: van 2 semanas de carga; la siguiente puede seguir cargando si el atleta está fresco, o bajar si hay fatiga.')
  } else if (consecutiveLoading === 1) {
    lines.push('sugerencia: recién se retomó la carga. Todavía no toca descarga por ciclo.')
  } else {
    lines.push('sugerencia: la semana actual o la anterior fue liviana. Se puede volver a cargar.')
  }

  return lines
}

