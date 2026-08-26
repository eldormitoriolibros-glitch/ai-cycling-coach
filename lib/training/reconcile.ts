import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, DAY_MS, localDateKey } from './dates'

import 'server-only'

/** How many past days to reconcile on each run. */
const LOOKBACK_DAYS = 4

export type ReconcileResult = { completed: number; skipped: number }

/**
 * Closes out past sessions: a scheduled workout with a ride on the same day
 * becomes `completed`, one without becomes `skipped`. Today is left alone.
 */
export async function reconcileWorkouts(userId: string): Promise<ReconcileResult> {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle()

  const timeZone = profile?.timezone || 'UTC'
  const today = localDateKey(new Date(), timeZone)
  const from = addDays(today, -LOOKBACK_DAYS)
  const to = addDays(today, -1)

  const [{ data: workouts }, { data: activities }] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, scheduled_date, workout_type')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to),
    supabase
      .from('activities')
      .select('id, start_time')
      .eq('user_id', userId)
      // Widened by a day on each side so timezone shifts cannot drop a ride.
      .gte('start_time', new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS).toISOString())
      .lte('start_time', new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY_MS).toISOString()),
  ])

  if (!workouts?.length) return { completed: 0, skipped: 0 }

  // Strava can only confirm cycling sessions. Anything else (e.g. a future
  // strength/gym entry) is left 'scheduled' instead of being auto-marked
  // skipped just because no ride shows up that day.
  const CYCLING_TYPES = new Set(['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2max'])
  const reconcilable = workouts.filter((w) => !w.workout_type || CYCLING_TYPES.has(w.workout_type))
  if (!reconcilable.length) return { completed: 0, skipped: 0 }

  const byDate = new Map<string, string>()
  for (const activity of activities ?? []) {
    const key = localDateKey(activity.start_time, timeZone)
    if (!byDate.has(key)) byDate.set(key, activity.id)
  }

  let completed = 0
  let skipped = 0

  await Promise.all(
    reconcilable.map((workout) => {
      const activityId = byDate.get(workout.scheduled_date)
      if (activityId) completed++
      else skipped++

      return supabase
        .from('workouts')
        .update(
          activityId
            ? { status: 'completed' as const, completed_activity_id: activityId }
            : { status: 'skipped' as const }
        )
        .eq('id', workout.id)
    })
  )

  return { completed, skipped }
}
