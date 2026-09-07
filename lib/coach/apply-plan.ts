import { splitPlanBlock, type CoachPlan } from '@/lib/training/coach-plan'
import { isPlanConfirm } from '@/lib/training/plan-intent'
import { coachPlanToDraft, commitWeeklyPlan } from '@/lib/training/plan-service'
import { createAdminClient } from '@/lib/supabase/admin'

import 'server-only'

/** The last coach message that already proposed a structured plan. */
async function lastProposedPlan(userId: string): Promise<CoachPlan | null> {
  const { data } = await createAdminClient()
    .from('coach_messages')
    .select('message')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.message ? splitPlanBlock(data.message).plan : null
}

/**
 * Persist a plan only after the athlete confirms the specific change
 * the coach just proposed. Asking for a change does not save it.
 */
export async function applyCoachPlanIfRequested(
  userId: string,
  userMessage: string,
  reply: string
): Promise<{ reply: string; created: number }> {
  if (!isPlanConfirm(userMessage)) {
    return { reply, created: 0 }
  }

  const plan = (await lastProposedPlan(userId)) ?? splitPlanBlock(reply).plan
  if (!plan) return { reply, created: 0 }

  const proposal = await coachPlanToDraft(userId, plan)
  if (!proposal.draft.workouts.length) return { reply, created: 0 }

  const created = await commitWeeklyPlan(userId, proposal.draft, proposal.rationale)
  if (!created) return { reply, created: 0 }

  const visible = splitPlanBlock(reply).text
  const note = `Cambio confirmado. Quedó en tu plan: ${created} sesión${created === 1 ? '' : 'es'}.`
  return { reply: visible ? `${visible}\n\n${note}` : note, created }
}
