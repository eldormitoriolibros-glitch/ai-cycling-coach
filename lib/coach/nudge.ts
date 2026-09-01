import { createAdminClient } from '@/lib/supabase/admin'
import { localDateKey } from '@/lib/training/dates'
import { formatDailyNudge } from './nudge-format'

import 'server-only'

/**
 * Deterministic daily message. No AI call: it runs unattended every day, and
 * burning free-tier quota on a templated nudge is not worth it.
 */
export async function buildDailyNudge(userId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('users')
    .select('name, timezone')
    .eq('id', userId)
    .maybeSingle()

  const timeZone = profile?.timezone || 'UTC'
  const today = localDateKey(new Date(), timeZone)

  const [{ data: workouts }, { data: load }] = await Promise.all([
    supabase
      .from('workouts')
      .select(
        'title, description, duration_minutes, target_zone, target_power, target_hr, purpose, status, workout_type'
      )
      .eq('user_id', userId)
      .eq('scheduled_date', today)
      .order('workout_type', { ascending: true }),
    supabase
      .from('training_load')
      .select('chronic_load, acute_load, form')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return formatDailyNudge({
    name: profile?.name ?? null,
    workouts: workouts ?? [],
    load: load ?? null,
  })
}
