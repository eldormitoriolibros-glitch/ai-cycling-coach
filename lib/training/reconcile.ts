import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, DAY_MS, localDateKey } from './dates'

import 'server-only'

/** How many past days to reconcile on each run. */
const LOOKBACK_DAYS = 4

/**
 * Strava can only confirm cycling sessions. Anything else (e.g. a strength or
 * gym entry) is left 'scheduled' instead of being auto-marked skipped just
 * because no ride shows up that day.
 */
const CYCLING_TYPES = new Set(['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2max'])

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

  const [{ data: workouts }, { data: activities }, { data: unlinked }] = await Promise.all([
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
    supabase
      .from('workouts')
      .select('id, scheduled_date, workout_type')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .is('completed_activity_id', null)
      .gte('scheduled_date', from)
      .lte('scheduled_date', today),
  ])

  const rideByDate = new Map<string, string>()
  for (const activity of activities ?? []) {
    const key = localDateKey(activity.start_time, timeZone)
    if (!rideByDate.has(key)) rideByDate.set(key, activity.id)
  }

  // Sessions marked done by hand carry no activity id, which breaks the link
  // between the plan and the ride in both directions.
  await Promise.all(
    (unlinked ?? [])
      .filter((w) => !w.workout_type || CYCLING_TYPES.has(w.workout_type))
      .map((w) => {
        const activityId = rideByDate.get(w.scheduled_date)
        if (!activityId) return Promise.resolve()
        return supabase.from('workouts').update({ completed_activity_id: activityId }).eq('id', w.id)
      })
  )

  if (!workouts?.length) return { completed: 0, skipped: 0 }

  const reconcilable = workouts.filter((w) => !w.workout_type || CYCLING_TYPES.has(w.workout_type))
  if (!reconcilable.length) return { completed: 0, skipped: 0 }

  let completed = 0
  let skipped = 0

  await Promise.all(
    reconcilable.map((workout) => {
      const activityId = rideByDate.get(workout.scheduled_date)
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
