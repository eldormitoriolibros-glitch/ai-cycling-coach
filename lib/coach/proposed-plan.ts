import { splitPlanBlock, type CoachPlan } from '@/lib/training/coach-plan'

const SKIP_INTENTS = new Set(['session_review', 'daily_nudge'])

/**
 * The pending proposal is the latest coach message that is not a review or
 * nudge. Reviews often land after a plan change; using them (or an older week
 * buried further back) produced two conflicting evaluations.
 */
export function pickLastProposedPlan(
  messages: { message?: string | null; intent?: string | null }[]
): CoachPlan | null {
  for (const row of messages) {
    if (row.intent && SKIP_INTENTS.has(row.intent)) continue
    return row.message ? splitPlanBlock(row.message).plan : null
  }
  return null
}
