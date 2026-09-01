import { generateReply, isAiConfigured } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays } from './dates'
import {
  BLOCK_LENGTH,
  buildWeeklyPlan,
  loadFor,
  TEMPLATES,
  type PlanDraft,
  type SessionKind,
  type WorkoutDraft,
} from './planner2'
import { computeReadiness } from '@/lib/training/readiness'
import { splitCombinedSession } from './split-sessions'
import { formatBikeDescription } from './workout-blocks'

import 'server-only'

const RATIONALE_RULES = `Sos un entrenador de ciclismo. Te paso un plan semanal ya calculado por el sistema.

Escribí una explicación breve en español rioplatense: por qué esta semana está armada así, en 3 o 4 oraciones. Máximo 90 palabras.

No cambies ni un número. No agregues sesiones. No inventes datos que no estén en el plan. No des consejos médicos. Nada de markdown ni listas.`

/** Today + 1, in the athlete's timezone. */
function tomorrowIn(timeZone: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

export type PlanProposal = {
  draft: PlanDraft
  rationale: string | null
  replacesExisting: number
}

/**
 * Consecutive loading weeks immediately before `startDate`. Only contiguous
 * weeks count, so a gap in training restarts the block.
 */
async function countLoadingWeeks(userId: string, startDate: string): Promise<number> {
  const { data } = await createAdminClient()
    .from('plan_weeks')
    .select('start_date, emphasis')
    .eq('user_id', userId)
    .lt('start_date', startDate)
    .gte('start_date', addDays(startDate, -7 * BLOCK_LENGTH))
    .order('start_date', { ascending: false })

  let count = 0
  let expected = addDays(startDate, -7)

  for (const week of data ?? []) {
    if (week.start_date !== expected) break
    if (week.emphasis === 'recovery') break
    count++
    expected = addDays(expected, -7)
  }

  return count
}

export async function proposeWeeklyPlan(userId: string, startDate?: string): Promise<PlanProposal> {
  const supabase = createAdminClient()

  const [{ data: profile }, { data: metrics }, { data: availability }, { data: load }, { data: recovery }, { data: sleep }] =
    await Promise.all([
      supabase.from('users').select('timezone, experience_level').eq('id', userId).maybeSingle(),
      supabase.from('athlete_metrics').select('ftp, max_hr').eq('user_id', userId).maybeSingle(),
      supabase
        .from('availability')
        .select('day_of_week, bike_minutes, strength_minutes')
        .eq('user_id', userId)
        .gt('bike_minutes', 0),
      supabase
        .from('training_load')
        .select('chronic_load, form')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('recovery_metrics')
        .select('date, resting_hr, hrv, stress, soreness, motivation, body_battery_high, body_battery_low, spo2_avg')
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

  const timeZone = profile?.timezone || 'UTC'
  const start = startDate ?? tomorrowIn(timeZone)
  const latestRecovery = (recovery ?? []).length ? (recovery as any[])[0] : null
  const latestSleep = (sleep ?? []).length ? (sleep as any[])[0] : null
  const baselineResting = (recovery ?? []).length ? (recovery as any[]).reduce((s, r) => s + (r.resting_hr ?? 0), 0) / (recovery as any[]).length : null
  const baselineHrv = (recovery ?? []).length ? (recovery as any[]).reduce((s, r) => s + (r.hrv ?? 0), 0) / (recovery as any[]).length : null
  const readinessResult = computeReadiness({
    form: load?.form ?? null,
    restingHr: latestRecovery?.resting_hr ?? null,
    baselineRestingHr: baselineResting ?? null,
    hrv: latestRecovery?.hrv ?? null,
    baselineHrv: baselineHrv ?? null,
    sleepHours: latestSleep?.duration_minutes ? latestSleep.duration_minutes / 60 : null,
    sleepScore: latestSleep?.sleep_score ?? null,
    soreness: latestRecovery?.soreness ?? null,
    motivation: latestRecovery?.motivation ?? null,
    bodyBattery: (latestRecovery as any)?.body_battery_high ?? null,
    stressAvg: latestRecovery?.stress ?? null,
    spo2: (latestRecovery as any)?.spo2_avg ?? null,
  })

  const draft = buildWeeklyPlan({
    startDate: start,
    availability: availability ?? [],
    ftp: metrics?.ftp ?? null,
    maxHr: metrics?.max_hr ?? null,
    chronicLoad: load?.chronic_load ?? null,
    form: load?.form ?? null,
    readinessScore: readinessResult.score,
    experience: profile?.experience_level ?? null,
    loadingWeeksInBlock: await countLoadingWeeks(userId, start),
  })

  const { count } = await supabase
    .from('workouts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('scheduled_date', draft.startDate)
    .lte('scheduled_date', draft.endDate)

  return {
    draft,
    rationale: await explain(draft),
    replacesExisting: count ?? 0,
  }
}

/** One session as emitted by the coach's structured `plan` block. */
export type CoachSession = {
  date: string
  type: string
  duration_minutes: number
  title?: string
  description?: string
  target_zone?: string
}

export type CoachPlanInput = {
  emphasis?: 'recovery' | 'maintenance' | 'build'
  workouts: CoachSession[]
}

const SESSION_KINDS: SessionKind[] = [
  'recovery',
  'endurance',
  'long',
  'tempo',
  'threshold',
  'vo2max',
  'strength',
]

function expandCoachSessions(sessions: CoachSession[]): CoachSession[] {
  const out: CoachSession[] = []
  for (const w of sessions) {
    const parts = splitCombinedSession(w.title ?? '', w.duration_minutes)
    if (!parts || parts.length < 2) {
      out.push(w)
      continue
    }
    for (const part of parts) {
      out.push({
        date: w.date,
        type: part.kind === 'strength' ? 'strength' : w.type,
        duration_minutes: part.duration_minutes,
        title: part.title,
        description: part.kind === 'strength' ? 'Sesión de fuerza, independiente de la bici.' : w.description,
        target_zone: part.kind === 'strength' ? 'Fuerza' : w.target_zone,
      })
    }
  }
  return out
}

function clampMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return 60
  return Math.min(600, Math.max(15, Math.round(n)))
}

/**
 * Turns the coach's own structured plan (what it showed the athlete) into a
 * full, validated draft — verbatim. Zone, power/HR targets and training load
 * are derived deterministically from the session templates, so the numbers
 * stay consistent with the rest of the app without the coach having to invent
 * them.
 */
export async function coachPlanToDraft(userId: string, plan: CoachPlanInput): Promise<PlanProposal> {
  const supabase = createAdminClient()

  const { data: metrics } = await supabase
    .from('athlete_metrics')
    .select('ftp, max_hr')
    .eq('user_id', userId)
    .maybeSingle()

  const ftp = metrics?.ftp ?? null
  const maxHr = metrics?.max_hr ?? null

  const sessions = expandCoachSessions(
    (plan.workouts ?? [])
      .filter((w) => w && /^\d{4}-\d{2}-\d{2}$/.test(String(w.date)))
      .sort((a, b) => a.date.localeCompare(b.date))
  ).slice(0, 14)

  const workouts: WorkoutDraft[] = sessions.map((w) => {
    const kind: SessionKind = (SESSION_KINDS as string[]).includes(w.type)
      ? (w.type as SessionKind)
      : w.type === 'strength'
        ? 'strength'
        : 'endurance'
    const template = TEMPLATES[kind]
    const minutes = clampMinutes(w.duration_minutes)
    const power = kind === 'strength' || !ftp || !template.powerFactor ? null : Math.round(ftp * template.powerFactor)
    const hr = kind === 'strength' || !maxHr || !template.hrFactor ? null : Math.round(maxHr * template.hrFactor)
    const rawDescription = w.description?.trim()
    const description =
      kind === 'strength'
        ? (rawDescription || `${template.mainWork}.`).slice(0, 1000)
        : (rawDescription && /entrada|vuelta a la calma/i.test(rawDescription)
            ? rawDescription
            : formatBikeDescription({
                kind,
                totalMinutes: minutes,
                zone: (w.target_zone?.trim() || template.zone).slice(0, 20),
                mainWork: rawDescription || template.mainWork,
              })
          ).slice(0, 1000)

    return {
      scheduled_date: w.date,
      workout_type: kind,
      title: (w.title?.trim() || template.title).slice(0, 120),
      description,
      duration_minutes: minutes,
      target_zone: (w.target_zone?.trim() || template.zone).slice(0, 20),
      target_power: power,
      target_hr: hr,
      purpose: template.purpose,
      estimated_load: kind === 'strength' ? 0 : loadFor(minutes, template.intensityFactor),
    }
  })

  const startDate = workouts.length ? workouts[0].scheduled_date : tomorrowIn('UTC')
  const endDate = workouts.length ? workouts[workouts.length - 1].scheduled_date : startDate
  const plannedLoad = workouts.reduce((sum, w) => sum + w.estimated_load, 0)

  const draft: PlanDraft = {
    startDate,
    endDate,
    emphasis: plan.emphasis ?? 'maintenance',
    blockPosition: 1,
    weeklyTargetLoad: plannedLoad,
    plannedLoad,
    workouts,
    notes: [],
  }

  const { count } = await supabase
    .from('workouts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('scheduled_date', draft.startDate)
    .lte('scheduled_date', draft.endDate)

  return { draft, rationale: null, replacesExisting: count ?? 0 }
}

async function explain(draft: PlanDraft): Promise<string | null> {
  if (!isAiConfigured() || draft.workouts.length === 0) return null

  const summary = [
    `Semana ${draft.startDate} a ${draft.endDate}. Enfoque: ${draft.emphasis}. Semana ${draft.blockPosition} de ${BLOCK_LENGTH} del bloque.`,
    `Carga objetivo: ${draft.weeklyTargetLoad}. Carga planificada: ${draft.plannedLoad}.`,
    ...draft.workouts.map(
      (w) => `- ${w.scheduled_date}: ${w.title} (${w.target_zone}), ${w.duration_minutes} min, carga ${w.estimated_load}`
    ),
    ...draft.notes.map((n) => `nota: ${n}`),
  ].join('\n')

  try {
    return await generateReply(RATIONALE_RULES, [{ role: 'user', text: summary }], {
      temperature: 0.4,
      // Must cover the model's thinking tokens as well as the 90-word answer.
      maxOutputTokens: 1500,
    })
  } catch {
    // The plan is valid without a narrative; never block on the AI layer.
    return null
  }
}

/** Replaces still-scheduled sessions in the same window. Completed ones are left alone. */
export async function commitWeeklyPlan(
  userId: string,
  draft: PlanDraft,
  rationale: string | null
): Promise<number> {
  if (draft.workouts.length === 0) return 0

  const supabase = createAdminClient()

  const { error: deleteError } = await supabase
    .from('workouts')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('scheduled_date', draft.startDate)
    .lte('scheduled_date', draft.endDate)

  if (deleteError) throw new Error(deleteError.message)

  const { error } = await supabase.from('workouts').insert(
    draft.workouts.map((w) => ({
      user_id: userId,
      scheduled_date: w.scheduled_date,
      workout_type: w.workout_type,
      title: w.title,
      description: w.description,
      duration_minutes: w.duration_minutes,
      target_zone: w.target_zone,
      target_power: w.target_power,
      target_hr: w.target_hr,
      purpose: w.purpose,
      rationale,
      status: 'scheduled' as const,
    }))
  )

  if (error) throw new Error(error.message)

  const { error: weekError } = await supabase.from('plan_weeks').upsert(
    {
      user_id: userId,
      start_date: draft.startDate,
      end_date: draft.endDate,
      emphasis: draft.emphasis,
      block_position: draft.blockPosition,
      target_load: draft.weeklyTargetLoad,
      planned_load: draft.plannedLoad,
      rationale,
    },
    { onConflict: 'user_id,start_date' }
  )

  if (weekError) throw new Error(weekError.message)

  return draft.workouts.length
}
