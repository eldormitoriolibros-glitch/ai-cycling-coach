import { linkCompletedActivity, sendSessionReview } from '@/lib/coach/session-review'
import { REVIEW_GARMIN_SYNC, syncGarminData } from '@/lib/garmin/sync-service'
import { createAdminClient } from '@/lib/supabase/admin'

import 'server-only'

const CYCLING_TYPES = new Set(['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2max'])

export type CloseSessionResult = {
  activityId: string | null
  reviewSent: boolean
  /** Why the ride could not be pulled, when that is what went wrong. */
  syncError?: string
}

/**
 * Everything that has to happen once a session is marked done: pull the ride
 * so the coach can see it, link it to the plan, and send the review.
 *
 * Idempotent, so it is safe to run again from the cron or from a retry: the
 * ride is only pulled when the session has none, and the review only goes out
 * when `review_sent_at` is still empty.
 */
export async function closeSession(userId: string, workoutId: string): Promise<CloseSessionResult> {
  const supabase = createAdminClient()

  const { data: workout } = await supabase
    .from('workouts')
    .select('id, workout_type, status, completed_activity_id, review_sent_at')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!workout) throw new Error('Sesión no encontrada')
  if (workout.status !== 'completed') throw new Error('La sesión todavía no está marcada como hecha.')

  const result: CloseSessionResult = {
    activityId: workout.completed_activity_id,
    reviewSent: false,
  }

  const isRide = !workout.workout_type || CYCLING_TYPES.has(workout.workout_type)
  if (isRide && !workout.completed_activity_id) {
    const syncError = await pullRide(userId)
    if (syncError) result.syncError = syncError
    result.activityId = await linkCompletedActivity(userId, workoutId).catch(() => null)
  }

  if (workout.review_sent_at) return result

  result.reviewSent = Boolean(await sendSessionReview(userId, workoutId))
  return result
}

/**
 * Pulls the last couple of days from Garmin and returns the failure message,
 * or null when it worked. A dead sync used to be swallowed whole, which is how
 * a session ends up marked done with no ride behind it and nothing to show for
 * it, so the reason is also stored on the connection.
 */
async function pullRide(userId: string): Promise<string | null> {
  try {
    const sync = await syncGarminData(userId, REVIEW_GARMIN_SYNC)
    if (sync.error) await recordSyncError(userId, sync.error)
    return sync.error ?? null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falló la sincronización con Garmin.'
    await recordSyncError(userId, message)
    return message
  }
}

async function recordSyncError(userId: string, message: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('garmin_connections')
    .update({ last_sync_error: message, updated_at: new Date().toISOString() } as any)
    .eq('user_id', userId)
}
