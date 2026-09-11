import { splitPlanBlock, type CoachPlan } from '@/lib/training/coach-plan'
import {
  pendingPlanMetadata,
  pickLastPendingPlan,
  PLAN_APPLIED_INTENT,
  PROPOSED_PLAN_INTENT,
  readPendingPlan,
  type PendingPlanRecord,
} from '@/lib/coach/proposed-plan'
import { isPlanConfirm } from '@/lib/training/plan-intent'
import { coachPlanToDraft, commitWeeklyPlan } from '@/lib/training/plan-service'
import { createAdminClient } from '@/lib/supabase/admin'

import 'server-only'

type Channel = 'web' | 'telegram'

async function loadPendingPlan(userId: string) {
  const { data } = await createAdminClient()
    .from('coach_messages')
    .select('id, message, intent, metadata')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(20)

  return pickLastPendingPlan(data ?? [])
}

async function closePendingPlans(userId: string, appliedId?: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('coach_messages')
    .select('id, message, intent, metadata')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .eq('intent', PROPOSED_PLAN_INTENT)
    .order('created_at', { ascending: false })
    .limit(20)

  for (const row of data ?? []) {
    const record = readPendingPlan(row)
    if (!record || record.status !== 'pending') continue
    const status = appliedId && (row.id === appliedId || record.id === appliedId) ? 'applied' : 'superseded'
    await supabase
      .from('coach_messages')
      .update({
        metadata: pendingPlanMetadata({ id: record.id, plan: record.plan, status }),
        intent: status === 'applied' ? PLAN_APPLIED_INTENT : PROPOSED_PLAN_INTENT,
      })
      .eq('id', row.id)
      .eq('user_id', userId)
  }
}

/**
 * Persist a plan only after the athlete confirms the specific change
 * the coach just proposed. Asking for a change does not save it.
 */
export async function applyCoachPlanIfRequested(
  userId: string,
  userMessage: string,
  reply: string
): Promise<{ reply: string; created: number; proposed: CoachPlan | null }> {
  const fromReply = splitPlanBlock(reply)

  if (!isPlanConfirm(userMessage)) {
    return { reply, created: 0, proposed: fromReply.plan }
  }

  const pending = await loadPendingPlan(userId)
  const plan = pending?.plan ?? fromReply.plan
  if (!plan) return { reply, created: 0, proposed: null }

  const proposal = await coachPlanToDraft(userId, plan)
  if (!proposal.draft.workouts.length) return { reply, created: 0, proposed: null }

  const created = await commitWeeklyPlan(userId, proposal.draft, proposal.rationale)
  if (!created) return { reply, created: 0, proposed: null }

  await closePendingPlans(userId, pending?.messageId ?? pending?.id)

  const visible = fromReply.text
  const note = `Cambio confirmado. Quedó en tu plan: ${created} sesión${created === 1 ? '' : 'es'}.`
  return { reply: visible ? `${visible}\n\n${note}` : note, created, proposed: null }
}

/** Store the outbound turn and, if it carries a new proposal, make that the pending plan. */
export async function persistCoachOutbound(
  userId: string,
  channel: Channel,
  applied: { reply: string; created: number; proposed: CoachPlan | null }
): Promise<void> {
  const pending: PendingPlanRecord | null = applied.proposed
    ? { id: crypto.randomUUID(), plan: applied.proposed, status: 'pending' }
    : null

  if (pending) await closePendingPlans(userId)

  await createAdminClient().from('coach_messages').insert({
    user_id: userId,
    direction: 'outbound',
    channel,
    message: applied.reply,
    intent: applied.created ? PLAN_APPLIED_INTENT : pending ? PROPOSED_PLAN_INTENT : null,
    metadata: pending ? pendingPlanMetadata(pending) : {},
  })
}
