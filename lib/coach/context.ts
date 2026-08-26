import { createAdminClient } from '@/lib/supabase/admin'
import { formatDistance, formatDuration } from '@/lib/utils'
import { addDays } from '@/lib/training/dates'
import { buildRecentActivityInsights } from './activity-insights'

import 'server-only'

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Compact, plain-text snapshot of the athlete. Kept small on purpose: the free
 * Gemini tier has token limits and a shorter context gives sharper answers.
 */
export async function buildAthleteContext(userId: string): Promise<string> {
  const supabase = createAdminClient()

  const [profile, metrics, availability, load, activities, workouts, recovery, sleep] =
    await Promise.all([
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      supabase.from('athlete_metrics').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('availability').select('*').eq('user_id', userId),
      supabase
        .from('training_load')
        .select('date, chronic_load, acute_load, form, ramp_rate')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('activities')
        .select('start_time, title, sport_type, distance_meters, moving_seconds, avg_power, avg_hr, training_load')
        .eq('user_id', userId)
        .order('start_time', { ascending: false })
        .limit(10),
      supabase
        .from('workouts')
        .select('scheduled_date, title, workout_type, duration_minutes, status')
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
    ])

  const p = profile.data
  const m = metrics.data

  const lines: string[] = []

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
  lines.push('## Carga de entrenamiento (calculada por la app)')
  if (load.data) {
    lines.push(
      `fecha: ${load.data.date}, fitness/CTL: ${fmt(load.data.chronic_load)}, fatiga/ATL: ${fmt(load.data.acute_load)}, forma/TSB: ${fmt(load.data.form)}, rampa 7d: ${fmt(load.data.ramp_rate)}`
    )
  } else {
    lines.push('sin datos suficientes')
  }

  lines.push('')
  lines.push('## Últimas 10 actividades')
  if (activities.data?.length) {
    for (const a of activities.data) {
      lines.push(
        `- ${a.start_time.slice(0, 10)} · ${a.title ?? a.sport_type ?? 'actividad'} · ${formatDistance(a.distance_meters)} · ${formatDuration(a.moving_seconds)}` +
          (a.avg_power ? ` · ${Math.round(a.avg_power)} W` : '') +
          (a.avg_hr ? ` · ${a.avg_hr} ppm` : '') +
          (a.training_load ? ` · carga ${a.training_load}` : '')
      )
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
      lines.push(
        `- ${w.scheduled_date} (${when}) · ${w.title ?? w.workout_type ?? 'sesión'} · ${w.duration_minutes ?? '?'} min · estado: ${w.status}`
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

  lines.push(await buildRecentActivityInsights(userId, m?.max_hr ?? null, m?.ftp ?? null))

  return lines.join('\n')
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/d' : Math.round(value).toString()
}
