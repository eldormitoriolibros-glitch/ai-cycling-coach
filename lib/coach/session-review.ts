import { generateReply, isAiConfigured } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram/client'
import { formatLapsForCoach, type ActivityLapRow, type LapSample } from '@/lib/activities/laps'
import { loadActivitySamples } from '@/lib/activities/samples'
import { localDateKey } from '@/lib/training/dates'
import { looksStrength } from '@/lib/training/split-sessions'
import { formatDistance, formatDuration } from '@/lib/utils'
import { buildAthleteContext } from './context'
import { COACH_DOCTRINE_REVIEW } from './doctrine'
import { parseReviewDate } from './review-intent'
import { compareSession, formatSessionComparison, pinReviewVerdict } from './session-compare'
import { composeReviewSystemPrompt } from './system-prompt'

import 'server-only'

const REVIEW_RULES = `Sos el entrenador de ciclismo de este atleta. Te pidió la devolución de una sesión (o acaba de marcarla como hecha) y se la mandás por Telegram.

Escribí en español rioplatense, texto plano (sin markdown, sin tablas, sin asteriscos), máximo 12 líneas.

Estructura:
1. Una línea de veredicto: copiá el de "Comparación (calculada por la app)" si está. No lo suavices ni lo contradigas.
2. Comparación concreta prescripto vs ejecutado con esos números: duración, intensidad/zona, y si hay vueltas, bloque por bloque (potencia, pulso, cadencia). Si una vuelta dice "cae" o "sube", es la forma dentro del bloque (primera vs segunda mitad), no el promedio. Usá números reales del contexto.
3. Qué salió bien y qué corregir, con una causa probable.
4. Qué implica para la próxima sesión (sin cambiar el plan salvo que haga falta; si hace falta, proponelo y pedí confirmación).

Reglas: no inventes datos que no estén; si falta información (por ejemplo una sesión de fuerza que la app no puede medir), preguntale cómo le fue en vez de suponer. No des diagnósticos médicos. Si hay muchas vueltas de ~1 min, no digas que falta una vuelta de 10 min para evaluar: pueden ser over-under / 1x1 dentro de una serie más larga. "Recuperación" es solo lo claramente fácil (Z1). El under de un over-under es trabajo. Si la comparación de la app reconstruyó bloques, usá ese número.`

type ReviewWorkout = {
  id: string
  scheduled_date: string
  title: string | null
  description: string | null
  workout_type: string | null
  duration_minutes: number | null
  target_zone: string | null
  target_power: number | null
  target_hr: number | null
  purpose: string | null
  completed_activity_id: string | null
  review_sent_at: string | null
}

function describePrescription(workout: ReviewWorkout): string[] {
  const lines = [
    `fecha: ${workout.scheduled_date}`,
    `título: ${workout.title ?? 'sesión'}`,
    `tipo: ${workout.workout_type ?? 'n/d'}`,
    `duración prescripta: ${workout.duration_minutes ?? 'n/d'} min`,
  ]
  if (workout.target_zone) lines.push(`zona objetivo: ${workout.target_zone}`)
  if (workout.target_power) lines.push(`potencia objetivo: ${workout.target_power} W`)
  if (workout.target_hr) lines.push(`pulso objetivo: ${workout.target_hr} ppm`)
  if (workout.description) lines.push(`prescripción: ${workout.description}`)
  if (workout.purpose) lines.push(`objetivo: ${workout.purpose}`)
  return lines
}

function describeExecution(activity: any | null, laps: ActivityLapRow[], samples: LapSample[] = []): string[] {
  if (!activity) {
    return ['no hay actividad registrada para esta sesión (la app no puede medirla, por ejemplo fuerza o gimnasio)']
  }

  const parts = [
    `título: ${activity.title ?? activity.sport_type ?? 'actividad'}`,
    `duración: ${formatDuration(activity.moving_seconds ?? activity.duration_seconds)}`,
  ]
  if (activity.distance_meters) parts.push(`distancia: ${formatDistance(activity.distance_meters)}`)
  if (activity.avg_power) parts.push(`potencia media: ${Math.round(activity.avg_power)} W`)
  if (activity.normalized_power) parts.push(`NP: ${Math.round(activity.normalized_power)} W`)
  if (activity.intensity_factor) parts.push(`IF: ${Number(activity.intensity_factor).toFixed(2)}`)
  if (activity.avg_hr) parts.push(`pulso medio: ${activity.avg_hr} ppm`)
  if (activity.max_hr) parts.push(`pulso máximo: ${activity.max_hr} ppm`)
  if (activity.avg_cadence) parts.push(`cadencia media: ${Math.round(activity.avg_cadence)} rpm`)
  if (activity.elevation_gain_meters) parts.push(`desnivel: +${Math.round(activity.elevation_gain_meters)} m`)
  if (activity.training_load) parts.push(`carga: ${Math.round(activity.training_load)}`)

  const lines = [parts.join(' · ')]
  const lapLines = formatLapsForCoach(laps, samples)
  if (lapLines.length) {
    lines.push(
      'vueltas marcadas por el atleta. Si son de ~1 min, pueden ser over-under / 1x1 dentro de un bloque más largo; recuperación es solo lo claramente fácil:'
    )
    lines.push(...lapLines)
  } else {
    lines.push('sin vueltas marcadas: no se puede analizar bloque por bloque.')
  }
  return lines
}

/**
 * Coach feedback for one finished session: prescribed vs executed, block by
 * block when the athlete used the lap button. Sent over Telegram and stored in
 * the chat so the web conversation stays in sync.
 *
 * Idempotent through `workouts.review_sent_at`, unless `force` is set because
 * the athlete asked again.
 */
export async function sendSessionReview(
  userId: string,
  workoutId: string,
  options?: { force?: boolean }
): Promise<string | null> {
  if (!isAiConfigured()) return null

  const supabase = createAdminClient()

  const { data: workout } = await supabase
    .from('workouts')
    .select(
      'id, scheduled_date, title, description, workout_type, duration_minutes, target_zone, target_power, target_hr, purpose, completed_activity_id, review_sent_at, status'
    )
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!workout || workout.status !== 'completed') return null
  if (workout.review_sent_at && !options?.force) return null

  const { data: profile } = await supabase
    .from('users')
    .select('timezone, telegram_chat_id')
    .eq('id', userId)
    .maybeSingle()

  const timeZone = profile?.timezone || 'UTC'
  const activity = await findSessionActivity(userId, workout as ReviewWorkout, timeZone)
  if (activity && !workout.completed_activity_id) {
    await supabase.from('workouts').update({ completed_activity_id: activity.id }).eq('id', workout.id)
  }

  let laps: ActivityLapRow[] = []
  let samples: LapSample[] = []
  if (activity) {
    const { data } = await supabase
      .from('activity_laps')
      .select(
        'lap_index, start_offset_seconds, elapsed_seconds, moving_seconds, distance_meters, avg_speed, max_speed, avg_hr, max_hr, avg_cadence, max_cadence, avg_power, max_power, normalized_power, elevation_gain_meters, calories, lap_trigger, intensity'
      )
      .eq('activity_id', activity.id)
      .order('lap_index', { ascending: true })
    laps = (data ?? []) as ActivityLapRow[]
    if (laps.length >= 2) {
      samples = await loadActivitySamples(supabase, activity.id).catch(() => [])
    }
  }

  const context = await buildAthleteContext(userId)
  const comparison = compareSession({
    workoutType: workout.workout_type,
    title: workout.title,
    description: workout.description,
    durationMinutes: workout.duration_minutes,
    targetZone: workout.target_zone,
    targetPower: workout.target_power,
    targetHr: workout.target_hr,
    hasActivity: Boolean(activity),
    movingSeconds: activity?.moving_seconds,
    avgPower: activity?.avg_power,
    normalizedPower: activity?.normalized_power,
    intensityFactor: activity?.intensity_factor,
    avgHr: activity?.avg_hr,
    laps,
  })
  const prompt = [
    '# Sesión prescripta',
    ...describePrescription(workout as ReviewWorkout),
    '',
    '# Cómo la ejecutó',
    ...describeExecution(activity, laps, samples),
    '',
    '# Comparación (calculada por la app)',
    ...formatSessionComparison(comparison),
    '',
    '# Contexto del atleta',
    context,
  ].join('\n')

  const text = await generateReply(composeReviewSystemPrompt(COACH_DOCTRINE_REVIEW, REVIEW_RULES), [
    { role: 'user', text: prompt },
  ]).catch(() => null)

  if (!text) return null

  const pinned = pinReviewVerdict(text, comparison)

  await supabase
    .from('workouts')
    .update({ review_sent_at: new Date().toISOString() })
    .eq('id', workout.id)

  await supabase.from('coach_messages').insert({
    user_id: userId,
    direction: 'outbound',
    channel: profile?.telegram_chat_id ? 'telegram' : 'web',
    message: pinned,
    intent: 'session_review',
  })

  if (profile?.telegram_chat_id && isTelegramConfigured()) {
    await sendMessage(profile.telegram_chat_id, pinned).catch(() => {})
  }

  return pinned
}

export type OnDemandReview = {
  reply: string
  /** True when the structured review was generated and already delivered. */
  delivered: boolean
}

/**
 * Review on request. Without a day hint, the latest completed session.
 * With a day ("ayer", "el domingo"), every completed session that day.
 */
export async function requestReviewOnDemand(userId: string, message: string): Promise<OnDemandReview> {
  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('users').select('timezone').eq('id', userId).maybeSingle()
  const timeZone = profile?.timezone || 'UTC'
  const today = localDateKey(new Date(), timeZone)
  const date = parseReviewDate(message, today)

  let query = supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (date) query = query.eq('scheduled_date', date)

  const { data: workouts } = await query
    .order('scheduled_date', { ascending: false })
    .order('workout_type', { ascending: true })
    .limit(date ? 8 : 1)
  if (!workouts?.length) {
    return {
      delivered: false,
      reply: date
        ? `El ${date} no hay ninguna sesión marcada como hecha. Si la hiciste, marcála y te mando la devolución.`
        : 'No hay ninguna sesión hecha para devolver. Marcá una como hecha o pedime un día concreto (ayer, el domingo).',
    }
  }

  const texts: string[] = []
  for (const workout of workouts) {
    const text = await sendSessionReview(userId, workout.id, { force: true }).catch(() => null)
    if (text) texts.push(text)
  }

  if (!texts.length) {
    return {
      delivered: false,
      reply: 'No pude armar la devolución. Probá de nuevo en un rato.',
    }
  }

  return { delivered: true, reply: texts.join('\n\n') }
}

/**
 * Links a finished session to the ride that closed it. Marking a workout done
 * by hand only sets the status, so without this the plan and the activity have
 * no way to point at each other.
 */
export async function linkCompletedActivity(userId: string, workoutId: string): Promise<string | null> {
  const supabase = createAdminClient()

  const { data: workout } = await supabase
    .from('workouts')
    .select('id, scheduled_date, completed_activity_id, workout_type')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!workout) return null
  if (workout.completed_activity_id) return workout.completed_activity_id

  const { data: profile } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle()

  const activity = await findSessionActivity(userId, workout as ReviewWorkout, profile?.timezone || 'UTC')
  if (!activity) return null

  await supabase.from('workouts').update({ completed_activity_id: activity.id }).eq('id', workout.id)
  return activity.id
}

/** The ride that closed this session: the linked one, or any ride that day. */
async function findSessionActivity(userId: string, workout: ReviewWorkout, timeZone: string) {
  if (looksStrength(workout.title, workout.workout_type)) return null

  const supabase = createAdminClient()
  const select =
    'id, title, sport_type, start_time, duration_seconds, moving_seconds, distance_meters, avg_power, normalized_power, intensity_factor, avg_hr, max_hr, avg_cadence, elevation_gain_meters, training_load'

  if (workout.completed_activity_id) {
    const { data } = await supabase
      .from('activities')
      .select(select)
      .eq('id', workout.completed_activity_id)
      .maybeSingle()
    if (data) return data
  }

  const dayStart = new Date(Date.parse(`${workout.scheduled_date}T00:00:00Z`) - 86_400_000).toISOString()
  const dayEnd = new Date(Date.parse(`${workout.scheduled_date}T00:00:00Z`) + 2 * 86_400_000).toISOString()

  const { data: sameDay } = await supabase
    .from('activities')
    .select(select)
    .eq('user_id', userId)
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd)
    .order('start_time', { ascending: false })

  return (
    (sameDay ?? []).find((a) => localDateKey(a.start_time, timeZone) === workout.scheduled_date) ?? null
  )
}
