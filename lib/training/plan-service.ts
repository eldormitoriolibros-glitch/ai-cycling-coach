import { generateReply, isAiConfigured } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays } from './dates'
import { BLOCK_LENGTH, buildWeeklyPlan, type PlanDraft } from './planner'

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

  const [{ data: profile }, { data: metrics }, { data: availability }, { data: load }] =
    await Promise.all([
      supabase.from('users').select('timezone, experience_level').eq('id', userId).maybeSingle(),
      supabase.from('athlete_metrics').select('ftp, max_hr').eq('user_id', userId).maybeSingle(),
      supabase
        .from('availability')
        .select('day_of_week, start_time, end_time, max_duration_minutes')
        .eq('user_id', userId)
        .eq('available', true),
      supabase
        .from('training_load')
        .select('chronic_load, form')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const timeZone = profile?.timezone || 'UTC'
  const start = startDate ?? tomorrowIn(timeZone)

  const draft = buildWeeklyPlan({
    startDate: start,
    availability: availability ?? [],
    ftp: metrics?.ftp ?? null,
    maxHr: metrics?.max_hr ?? null,
    chronicLoad: load?.chronic_load ?? null,
    form: load?.form ?? null,
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
      maxOutputTokens: 250,
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
