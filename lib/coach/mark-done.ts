import { createAdminClient } from '@/lib/supabase/admin'
import { syncGarminData } from '@/lib/garmin/sync-service'
import { looksStrength } from '@/lib/training/split-sessions'
import { localDateKey } from '@/lib/training/dates'
import { linkCompletedActivity } from './session-review'

import 'server-only'

export type SessionScope = 'bike' | 'strength'

export type MarkDoneResult = {
  status: 'done' | 'already_done' | 'not_found'
  title: string | null
  /** Set when the session was just marked, so the caller can review it. */
  workoutId: string | null
}

/**
 * Marks today's bike or strength session as done. Same path as the "Hecho"
 * button on the web: the ride is pulled and linked first so the review can
 * compare prescribed against executed. The review itself is left to the
 * caller, which acknowledges over the chat before the slow model call.
 */
export async function markTodaySessionDone(
  userId: string,
  scope: SessionScope,
  timeZone: string
): Promise<MarkDoneResult> {
  const supabase = createAdminClient()
  const today = localDateKey(new Date(), timeZone)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, title, workout_type, status')
    .eq('user_id', userId)
    .eq('scheduled_date', today)

  const matching = (workouts ?? []).filter((w) => {
    const strength = looksStrength(w.title, w.workout_type)
    return scope === 'strength' ? strength : !strength
  })

  if (matching.length === 0) return { status: 'not_found', title: null, workoutId: null }

  const pending = matching.find((w) => w.status !== 'completed')
  if (!pending) {
    return { status: 'already_done', title: matching[0].title, workoutId: null }
  }

  await supabase.from('workouts').update({ status: 'completed' }).eq('id', pending.id)

  if (scope === 'bike') {
    await syncGarminData(userId).catch(() => null)
    await linkCompletedActivity(userId, pending.id).catch(() => null)
  }

  return { status: 'done', title: pending.title, workoutId: pending.id }
}
