import { createAdminClient } from '@/lib/supabase/admin'

import 'server-only'

const DISTANCE_TOLERANCE_RATIO = 0.015
const DISTANCE_TOLERANCE_MIN_M = 250
const DURATION_TOLERANCE_S = 300

/**
 * Drops manually imported rides once the same ride arrives from Strava.
 * Without this, a CSV import followed by a later Strava sync would count the
 * same effort twice in the training-load series.
 */
export async function removeDuplicateManualActivities(userId: string): Promise<number> {
  const supabase = createAdminClient()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, source, distance_meters, moving_seconds, duration_seconds')
    .eq('user_id', userId)

  if (!activities?.length) return 0

  const duration = (a: (typeof activities)[number]) => a.moving_seconds ?? a.duration_seconds
  const strava = activities.filter((a) => a.source === 'strava')
  const manual = activities.filter((a) => a.source === 'manual')

  const doomed = manual
    .filter((m) => {
      const md = m.distance_meters
      const mt = duration(m)
      if (md === null || mt === null) return false

      const allowed = Math.max(DISTANCE_TOLERANCE_MIN_M, md * DISTANCE_TOLERANCE_RATIO)
      return strava.some((s) => {
        const sd = s.distance_meters
        const st = duration(s)
        if (sd === null || st === null) return false
        return Math.abs(sd - md) <= allowed && Math.abs(st - mt) <= DURATION_TOLERANCE_S
      })
    })
    .map((m) => m.id)

  if (doomed.length === 0) return 0

  await supabase.from('activities').delete().in('id', doomed)
  return doomed.length
}
