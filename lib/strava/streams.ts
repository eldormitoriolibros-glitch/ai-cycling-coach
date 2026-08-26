import { createAdminClient } from '@/lib/supabase/admin'
import { computeNormalizedPower, computePowerCurve, maxPower } from '@/lib/training/power-curve'
import { getAllStreams, getWattsStream, StravaError } from './client'

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

/**
 * Fetches and stores all streams (second-by-second data) for rides that don't have
 * samples yet. This enables precise time-series graphs with real HR, power, cadence data.
 *
 * Stops early on a rate limit; the next run resumes where this one stopped.
 */
export async function backfillActivitySamples(
  userId: string,
  accessToken: string,
  limit = STREAM_LIMIT_BACKGROUND
): Promise<BackfillResult> {
  const supabase = createAdminClient()

  const { data: candidates, count } = await supabase
    .from('activities')
    .select('id, external_id, duration_seconds, moving_seconds', { count: 'exact' })
    .eq('user_id', userId)
    .eq('source', 'strava')
    .order('start_time', { ascending: false })
    .limit(limit * 3)

  if (!candidates?.length) return { processed: 0, remaining: 0 }

  // A candidate needs (re)fetching if it has no samples yet, or if its last
  // stored sample stops well short of the ride's real duration — the
  // signature left by the old delete+insert race that used to abort mid-chunk.
  const unsynced: typeof candidates = []
  for (const activity of candidates) {
    if (unsynced.length >= limit) break
    const { data: lastSample } = (await supabase
      .from('activity_samples')
      .select('offset_seconds')
      .eq('activity_id', activity.id)
      .order('offset_seconds', { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: { offset_seconds: number } | null }

    const expectedDuration = activity.duration_seconds ?? activity.moving_seconds ?? 0
    const lastOffset = lastSample?.offset_seconds ?? -1
    const incomplete = expectedDuration > 0 && lastOffset < expectedDuration * 0.9

    if (lastOffset < 0 || incomplete) unsynced.push(activity)
  }

  if (!unsynced.length) return { processed: 0, remaining: 0 }

  let processed = 0

  for (const activity of unsynced) {
    try {
      const streams = await getAllStreams(accessToken, Number(activity.external_id))
      const hasData = streams !== null && streams.time.length > 0

      if (hasData && streams) {
        // Insert activity samples (second-by-second data)
        const samples = streams.time.map((offsetSeconds, idx) => ({
          user_id: userId,
          activity_id: activity.id,
          offset_seconds: offsetSeconds,
          heart_rate: streams.heartrate[idx],
          power: streams.watts[idx],
          cadence: streams.cadence[idx],
          speed: streams.velocity_smooth[idx],
          elevation: streams.altitude[idx],
          temperature: streams.temperature[idx],
          latitude: streams.latlng[idx]?.[0] ?? null,
          longitude: streams.latlng[idx]?.[1] ?? null,
        }))

        // Upsert instead of delete+insert: avoids losing already-stored rows to a
        // conflict if two syncs for the same activity ever overlap.
        for (let i = 0; i < samples.length; i += 1000) {
          const chunk = samples.slice(i, i + 1000) as any
          if (chunk.length > 0) {
            const { error: insertError } = await supabase
              .from('activity_samples')
              .upsert(chunk, { onConflict: 'activity_id,offset_seconds' })
            if (insertError) {
              console.error(`backfillActivitySamples: upsert failed for activity ${activity.id}:`, insertError.message)
            }
          }
        }
      }

      await supabase
        .from('activities')
        .update({
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
