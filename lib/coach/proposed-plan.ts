import { normalizeCoachPlan, splitPlanBlock, type CoachPlan } from '@/lib/training/coach-plan'
import type { Json } from '@/lib/types/database'

export const PROPOSED_PLAN_INTENT = 'proposed_plan'
export const PLAN_APPLIED_INTENT = 'plan_applied'

const SKIP_INTENTS = new Set(['session_review', 'daily_nudge'])

export type PendingPlanStatus = 'pending' | 'applied' | 'superseded'

export type PendingPlanRecord = {
  id: string
  plan: CoachPlan
  status: PendingPlanStatus
}

export type ProposedPlanRow = {
  id?: string
  message?: string | null
  intent?: string | null
  metadata?: unknown
}

export type PendingPlanHit = PendingPlanRecord & { messageId?: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function pendingPlanMetadata(record: PendingPlanRecord): Json {
  return {
    plan_id: record.id,
    plan: record.plan as unknown as Json,
    status: record.status,
  }
}

export function readPendingPlan(row: ProposedPlanRow): PendingPlanHit | null {
  const meta = asRecord(row.metadata)
  const planFromMeta = meta ? normalizeCoachPlan(meta.plan) : null
  if (planFromMeta && typeof meta?.plan_id === 'string') {
    const status: PendingPlanStatus =
      meta.status === 'applied' || meta.status === 'superseded' ? meta.status : 'pending'
    return { id: meta.plan_id, plan: planFromMeta, status, messageId: row.id }
  }
  if (!row.message) return null
  const plan = splitPlanBlock(row.message).plan
  if (!plan) return null
  return { id: row.id ?? 'legacy', plan, status: 'pending', messageId: row.id }
}

/**
 * Latest still-open proposal.
 *
 * Metadata-backed plans survive follow-up chat ("qué zona es Z2?"). The first
 * metadata plan wins: pending is applied, applied/superseded stops the search
 * so a second "sí" does not resurrect an older week.
 *
 * Messages without metadata keep the old rule: the first non-review reply,
 * and never walk past a plan-less message into a buried week.
 */
export function pickLastPendingPlan(messages: ProposedPlanRow[]): PendingPlanHit | null {
  for (const row of messages) {
    if (row.intent && SKIP_INTENTS.has(row.intent)) continue
    const meta = asRecord(row.metadata)
    if (meta?.plan_id && normalizeCoachPlan(meta.plan)) {
      const record = readPendingPlan(row)
      if (!record) continue
      return record.status === 'pending' ? record : null
    }
  }

  for (const row of messages) {
    if (row.intent && SKIP_INTENTS.has(row.intent)) continue
    return row.message ? readPendingPlan({ ...row, metadata: undefined }) : null
  }
  return null
}

export function pickLastProposedPlan(
  messages: { message?: string | null; intent?: string | null; metadata?: unknown; id?: string }[]
): CoachPlan | null {
  return pickLastPendingPlan(messages)?.plan ?? null
}
