import { createAdminClient } from '@/lib/supabase/admin'
import { formatDistance, formatDuration } from '@/lib/utils'
import { addDays, localDateKey } from '@/lib/training/dates'
import { buildRecentActivityInsights } from './activity-insights'
import { loadPowerSummary } from '@/lib/training/ftp'
import { formatLoadSeries, formatPowerContext, formatExecution } from './execution'

import 'server-only'

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Compact, plain-text snapshot of the athlete. Kept small on purpose: the free
 * Gemini tier has token limits and a shorter context gives sharper answers.
 */
export async function buildAthleteContext(userId: string): Promise<string> {
  const supabase = createAdminClient()

  const [profile, metrics, availability, loadSeries, activities, workouts, recovery, sleep, planWeek] =
    await Promise.all([
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      supabase.from('athlete_metrics').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('availability').select('*').eq('user_id', userId),
      supabase
        .from('training_load')
        .select('date, daily_load, chronic_load, acute_load, form, ramp_rate')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(15),
      supabase
        .from('activities')
        .select(
          'start_time, title, sport_type, distance_meters, moving_seconds, avg_power, normalized_power, intensity_factor, avg_hr, max_hr, avg_cadence, elevation_gain_meters, is_trainer, training_load'
        )
        .eq('user_id', userId)
        .order('start_time', { ascending: false })
        .limit(10),
      supabase
        .from('workouts')
        .select('scheduled_date, title, workout_type, duration_minutes, status, target_zone, target_power, target_hr, purpose, completed_activity_id')
        .eq('user_id', userId)
        .gte('scheduled_date', addDays(new Date().toISOString().slice(0, 10), -10))
        .order('scheduled_date', { ascending: true })
        .limit(20),
      supabase
        .from('recovery_metrics')
        .select('date, resting_hr, hrv, soreness, motivation')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(7),
      supabase
        .from('sleep')
        .select('date, duration_minutes, sleep_score')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(7),
      supabase
        .from('plan_weeks')
        .select('start_date, end_date, emphasis, block_position, target_load, planned_load')
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const powerSummary = await loadPowerSummary(userId)

  const p = profile.data
  const m = metrics.data
  const load = loadSeries.data
  const plan = planWeek.data

  const lines: string[] = []

  const tz = p?.timezone || 'UTC'
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const weekday = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long' }).format(new Date())
  lines.push('## Hoy')
  lines.push(`fecha: ${todayIso} (${weekday}). Usá esta fecha como referencia para "hoy", "mañana" y los días de la semana.`)
  lines.push('')

  lines.push('## Atleta')
  lines.push(
    [
      p?.name && `nombre: ${p.name}`,
      p?.age && `edad: ${p.age}`,
      p?.sex && `sexo: ${p.sex}`,
      p?.weight_kg && `peso: ${p.weight_kg} kg`,
      p?.height_cm && `altura: ${p.height_cm} cm`,
      p?.experience_level && `nivel: ${p.experience_level}`,
      p?.timezone && `zona horaria: ${p.timezone}`,
    ]
      .filter(Boolean)
      .join(', ') || 'sin datos de perfil cargados'
  )

  if (p?.cycling_goals?.length) lines.push(`objetivos: ${p.cycling_goals.join(', ')}`)

  lines.push('')
  lines.push('## Umbrales')
  lines.push(
    [
      m?.ftp ? `FTP: ${m.ftp} W (${m.ftp_source === 'estimated' ? 'estimado por la app' : 'cargado a mano'})` : 'FTP: no cargado',
      m?.max_hr ? `FC máx: ${m.max_hr}` : 'FC máx: no cargada',
      m?.resting_hr ? `FC reposo: ${m.resting_hr}` : 'FC reposo: no cargada',
    ].join(', ')
  )
  if (m?.ftp && p?.weight_kg) {
    lines.push(`W/kg en FTP: ${(m.ftp / Number(p.weight_kg)).toFixed(2)}`)
  }

  lines.push('')
  lines.push('## Disponibilidad semanal')
  const availableDays = (availability.data ?? [])
    .filter((a) => a.bike_minutes > 0 || a.strength_minutes > 0)
    .sort((x, y) => x.day_of_week - y.day_of_week)
  if (availableDays.length) {
    for (const a of availableDays) {
      const parts = [
        a.bike_minutes > 0 ? `${(a.bike_minutes / 60).toFixed(1)} h bici` : null,
        a.strength_minutes > 0 ? `${(a.strength_minutes / 60).toFixed(1)} h fuerza` : null,
      ].filter(Boolean)
      lines.push(`- ${DAYS[a.day_of_week]}: ${parts.join(', ')}`)
    }
  } else {
    lines.push('- no configurada')
  }

  lines.push('')
  // Carga series (last 14 days + 7d comparison)
  lines.push('## Carga de entrenamiento (calculada por la app)')
  lines.push(...formatLoadSeries(load ?? [], todayIso))

  lines.push('')
  lines.push('## Últimas 10 actividades')
  if (activities.data?.length) {
    for (const a of activities.data) {
      const date = localDateKey(a.start_time, tz)
      const parts = [
        `${date} · ${a.title ?? a.sport_type ?? 'actividad'}`,
        formatDistance(a.distance_meters),
        formatDuration(a.moving_seconds),
      ]
      if (a.avg_power) parts.push(`${Math.round(a.avg_power)} W`)
      if (a.normalized_power) parts.push(`NP ${Math.round(a.normalized_power)} W`)
      if (typeof a.intensity_factor === 'number') parts.push(`IF ${a.intensity_factor.toFixed(2)}`)
      if (a.avg_hr) parts.push(`${a.avg_hr} ppm`)
      if (a.max_hr) parts.push(`máx ${a.max_hr} ppm`)
      if (a.avg_cadence) parts.push(`cad ${Math.round(a.avg_cadence)}`)
      if (a.elevation_gain_meters) parts.push(`+${Math.round(a.elevation_gain_meters)} m`)
      if (a.is_trainer) parts.push('indoor')
      if (a.training_load) parts.push(`carga ${Math.round(a.training_load)}`)

      lines.push(`- ${parts.join(' · ')}`)
    }
  } else {
    lines.push('- ninguna sincronizada todavía')
  }

  if (workouts.data?.length) {
    lines.push('')
    lines.push('## Entrenamientos prescriptos (últimos 10 días y próximos 7)')
    const today = new Date().toISOString().slice(0, 10)
    for (const w of workouts.data) {
      const when = w.scheduled_date < today ? 'pasado' : w.scheduled_date === today ? 'hoy' : 'futuro'
      const extras = []
      if (w.target_zone) extras.push(w.target_zone)
      if (w.target_power) extras.push(`${w.target_power} W`)
      if (w.target_hr) extras.push(`${w.target_hr} ppm`)
      lines.push(
        `- ${w.scheduled_date} (${when}) · ${w.title ?? w.workout_type ?? 'sesión'} · ${w.duration_minutes ?? '?'} min${extras.length ? ' · ' + extras.join(' / ') : ''} · estado: ${w.status}`
      )
    }
  }

  const sleepByDate = new Map((sleep.data ?? []).map((s) => [s.date, s]))
  if (recovery.data?.length || sleep.data?.length) {
    lines.push('')
    lines.push('## Recuperación declarada (últimos días)')
    const dates = Array.from(
      new Set([...(recovery.data ?? []).map((r) => r.date), ...(sleep.data ?? []).map((s) => s.date)])
    )
      .sort()
      .reverse()

    for (const date of dates) {
      const r = recovery.data?.find((x) => x.date === date)
      const s = sleepByDate.get(date)
      const parts = [
        s?.duration_minutes ? `sueño ${(s.duration_minutes / 60).toFixed(1)} h` : null,
        s?.sleep_score ? `calidad ${s.sleep_score}` : null,
        r?.resting_hr ? `FC rep ${r.resting_hr}` : null,
        r?.hrv ? `HRV ${r.hrv}` : null,
        r?.soreness ? `dolor ${r.soreness}/10` : null,
        r?.motivation ? `ganas ${r.motivation}/10` : null,
      ].filter(Boolean)

      if (parts.length) lines.push(`- ${date}: ${parts.join(', ')}`)
    }
  }
  // Current plan week (if any)
  if (plan) {
    lines.push('')
    lines.push('## Bloque actual')
    lines.push(
      `semana ${plan.start_date} a ${plan.end_date} · ${plan.emphasis} · posición ${plan.block_position} de 4 · objetivo ${Math.round(
        Number(plan.target_load ?? 0)
      )} · planificado ${Math.round(Number(plan.planned_load ?? 0))}`
    )
  }

  // Prescripto vs ejecutado (últimos 7 días)
  lines.push('')
  lines.push('## Prescripto vs ejecutado (últimos 7 días)')
  lines.push(...formatExecution(workouts.data ?? [], activities.data ?? [], tz, todayIso))

  // Power summary (90 days)
  lines.push('')
  lines.push('## Curva de potencia (90 días)')
  lines.push(...formatPowerContext(powerSummary ?? null, m?.ftp ?? null))

  lines.push(await buildRecentActivityInsights(userId, m?.max_hr ?? null, m?.ftp ?? null))

  return lines.join('\n')
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/d' : Math.round(value).toString()
}
