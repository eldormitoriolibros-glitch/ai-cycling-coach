import { createAdminClient } from '@/lib/supabase/admin'
import { localDateKey } from '@/lib/training/dates'

import 'server-only'

/**
 * Deterministic daily message. No AI call: it runs unattended every day, and
 * burning free-tier quota on a templated nudge is not worth it.
 */
export async function buildDailyNudge(userId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('users')
    .select('name, timezone')
    .eq('id', userId)
    .maybeSingle()

  const timeZone = profile?.timezone || 'UTC'
  const today = localDateKey(new Date(), timeZone)

  const [{ data: workout }, { data: load }] = await Promise.all([
    supabase
      .from('workouts')
      .select('title, description, duration_minutes, target_zone, target_power, target_hr, purpose, status')
      .eq('user_id', userId)
      .eq('scheduled_date', today)
      .maybeSingle(),
    supabase
      .from('training_load')
      .select('chronic_load, acute_load, form')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lines: string[] = []
  const greeting = profile?.name ? `Buenas, ${profile.name}.` : 'Buenas.'
  lines.push(greeting)
  lines.push('')

  if (!workout) {
    lines.push('Hoy no hay sesión programada. Día libre.')
  } else if (workout.status !== 'scheduled') {
    lines.push(`La sesión de hoy ya está marcada como "${workout.status}". Nada pendiente.`)
  } else {
    const targets = [
      workout.target_power ? `${workout.target_power} W` : null,
      workout.target_hr ? `${workout.target_hr} ppm` : null,
    ].filter(Boolean)

    lines.push(
      `Hoy: ${workout.title ?? 'sesión'} · ${workout.target_zone ?? 's/z'} · ${workout.duration_minutes ?? '?'} min`
    )
    if (targets.length) lines.push(`Objetivo: ${targets.join(' / ')}`)
    if (workout.description) {
      lines.push('')
      lines.push(workout.description)
    }
    if (workout.purpose) {
      lines.push('')
      lines.push(`Para qué: ${workout.purpose}`)
    }
  }

  if (load) {
    lines.push('')
    lines.push(
      `Estado: fitness ${round(load.chronic_load)}, fatiga ${round(load.acute_load)}, forma ${round(load.form)}. ${describeForm(load.form)}`
    )
  }

  lines.push('')
  lines.push('Preguntame lo que quieras si algo no cierra.')

  return lines.join('\n')
}

function round(value: number | null): string {
  return value === null ? 'n/d' : Math.round(value).toString()
}

function describeForm(tsb: number | null): string {
  if (tsb === null) return ''
  if (tsb > 20) return 'Estás muy descansado.'
  if (tsb > 5) return 'Venís fresco.'
  if (tsb > -10) return 'Vas equilibrado.'
  if (tsb > -30) return 'Venís cargado, cuidá el descanso.'
  return 'Estás muy fatigado; si hoy no rinde, no fuerces.'
}
