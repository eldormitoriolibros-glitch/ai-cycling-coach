import { createAdminClient } from '@/lib/supabase/admin'
import { computeNormalizedPower, computePowerCurve, maxPower } from '@/lib/training/power-curve'
import { getWattsStream, StravaError } from './client'

import 'server-only'

/** Kept under the 200-per-15-minutes Strava budget, with room for the list calls. */
export const STREAM_LIMIT_MANUAL = 60
export const STREAM_LIMIT_BACKGROUND = 20

export type BackfillResult = { processed: number; remaining: number }

/**
 * Fetches the watts stream for rides that have power but no curve yet, then
 * derives the power curve, Normalized Power and peak watts from it.
 *
 * Estimated power counts: Strava reports `device_watts: false` for rides without
 * a power meter, but the watts stream is still there, and for an athlete with no
 * power meter and no HR strap it is the only training-stress signal available.
 *
 * Stops early on a rate limit; the next run resumes where this one stopped.
 */
export async function backfillPowerCurves(
  userId: string,
  accessToken: string,
  limit = STREAM_LIMIT_BACKGROUND
): Promise<BackfillResult> {
  const supabase = createAdminClient()

  const { data: pending, count } = await supabase
    .from('activities')
    .select('id, external_id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('source', 'strava')
    .not('avg_power', 'is', null)
    .is('power_curve', null)
    .is('streams_status', null)
    .order('start_time', { ascending: false })
    .limit(limit)

  if (!pending?.length) return { processed: 0, remaining: 0 }

  let processed = 0

  for (const activity of pending) {
    try {
      const watts = await getWattsStream(accessToken, Number(activity.external_id))
      const curve = watts ? computePowerCurve(watts) : {}
      const hasData = watts !== null && Object.keys(curve).length > 0

      await supabase
        .from('activities')
        .update({
          power_curve: hasData ? curve : null,
          normalized_power: watts ? computeNormalizedPower(watts) : null,
          max_power: watts ? maxPower(watts) : null,
          streams_status: hasData ? 'ok' : 'no_power',
          streams_fetched_at: new Date().toISOString(),
        })
        .eq('id', activity.id)

      processed++
    } catch (err) {
      if (err instanceof StravaError && err.status === 429) break

      await supabase
        .from('activities')
        .update({ streams_status: 'error', streams_fetched_at: new Date().toISOString() })
        .eq('id', activity.id)
    }
  }

  return { processed, remaining: Math.max(0, (count ?? 0) - processed) }
}
