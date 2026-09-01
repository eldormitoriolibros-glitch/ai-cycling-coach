import { createAdminClient } from '@/lib/supabase/admin'
import { removeDuplicateManualActivities, removeDuplicateActivities } from '@/lib/training/dedupe'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'
import { getActivity, listActivities, StravaError } from './client'
import {
  backfillPowerCurves,
  backfillActivitySamples,
  STREAM_LIMIT_BACKGROUND,
  STREAM_LIMIT_MANUAL,
} from './streams'
import { mapStravaActivity, type AthleteThresholds } from './mapper'
import { getValidAccessToken } from './tokens'
import type { SyncTrigger } from '@/lib/types/database'

import 'server-only'

const PER_PAGE = 100
const MAX_PAGES = 10
const FIRST_SYNC_DAYS = 180
/** Re-fetch a small overlap so activities edited after the last sync are picked up. */
const OVERLAP_SECONDS = 60 * 60 * 24

export type SyncResult = {
  synced: number
  status: 'success' | 'partial' | 'error'
  streamsProcessed: number
  streamsRemaining: number
  error?: string
}

async function loadThresholds(userId: string): Promise<AthleteThresholds> {
  const { data } = await createAdminClient()
    .from('athlete_metrics')
    .select('ftp, max_hr, resting_hr')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    ftp: data?.ftp ?? null,
    maxHr: data?.max_hr ?? null,
    restingHr: data?.resting_hr ?? null,
  }
}

/**
 * Pulls activities newer than the last successful sync (or the last 180 days).
 *
 * `full` ignores the incremental cursor and re-reads the whole window, which is
 * what you need after changing a Strava privacy setting: fields such as heart
 * rate only appear on a fresh read of an already-synced activity.
 */
export async function syncActivities(
  userId: string,
  trigger: SyncTrigger,
  options: { full?: boolean } = {}
): Promise<SyncResult> {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()

  let synced = 0
  let status: SyncResult['status'] = 'success'
  let errorMessage: string | undefined
  let streamsProcessed = 0
  let streamsRemaining = 0

  try {
    const [accessToken, thresholds, connection] = await Promise.all([
      getValidAccessToken(userId),
      loadThresholds(userId),
      supabase.from('strava_connections').select('last_sync_at').eq('user_id', userId).maybeSingle(),
    ])

    const lastSyncAt = connection.data?.last_sync_at
    const after =
      lastSyncAt && !options.full
        ? Math.floor(new Date(lastSyncAt).getTime() / 1000) - OVERLAP_SECONDS
        : Math.floor(Date.now() / 1000) - FIRST_SYNC_DAYS * 86400

    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await listActivities(accessToken, { after, page, perPage: PER_PAGE })
      if (batch.length === 0) break

      const rows = batch.map((activity) => mapStravaActivity(userId, activity, thresholds))
      const { error } = await supabase
        .from('activities')
        .upsert(rows, { onConflict: 'user_id,source,external_id' })

      if (error) throw new Error(error.message)

      synced += rows.length
      if (batch.length < PER_PAGE) break

      if (page === MAX_PAGES) status = 'partial'
    }

    await supabase
      .from('strava_connections')
      .update({ last_sync_at: new Date().toISOString(), last_sync_error: null, connection_status: 'connected' })
      .eq('user_id', userId)

    const backfill = await backfillPowerCurves(
      userId,
      accessToken,
      trigger === 'manual' ? STREAM_LIMIT_MANUAL : STREAM_LIMIT_BACKGROUND
    )
    streamsProcessed = backfill.processed
    streamsRemaining = backfill.remaining

    // Download all time-series data for charting (HR, power, cadence, speed, elevation)
    await backfillActivitySamples(
      userId,
      accessToken,
      trigger === 'manual' ? STREAM_LIMIT_MANUAL : STREAM_LIMIT_BACKGROUND
    )

    // A ride imported from CSV may now exist on Strava as well.
    await removeDuplicateManualActivities(userId)
    await removeDuplicateActivities(userId)

    // Normalized Power only exists after the backfill, so redo the estimates.
    await recomputeActivityLoads(userId)
    await recomputeTrainingLoad(userId)
  } catch (err) {
    status = 'error'
    errorMessage = err instanceof Error ? err.message : 'Error desconocido durante la sincronización.'

    await supabase
      .from('strava_connections')
      .update({
        last_sync_error: errorMessage,
        connection_status: err instanceof StravaError && err.status === 401 ? 'revoked' : 'error',
      })
      .eq('user_id', userId)
  }

  await supabase.from('sync_logs').insert({
    user_id: userId,
    source: 'strava',
    trigger,
    status,
    activities_synced: synced,
    error_message: errorMessage ?? null,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  })

  return { synced, status, streamsProcessed, streamsRemaining, error: errorMessage }
}

/** Used by the webhook for a single create/update event. */
export async function syncSingleActivity(userId: string, activityId: number): Promise<void> {
  const [accessToken, thresholds] = await Promise.all([
    getValidAccessToken(userId),
    loadThresholds(userId),
  ])

  const activity = await getActivity(accessToken, activityId)
  if (!activity) return

  const { error } = await createAdminClient()
    .from('activities')
    .upsert(mapStravaActivity(userId, activity, thresholds), {
      onConflict: 'user_id,source,external_id',
    })

  if (error) throw new Error(error.message)

  await backfillPowerCurves(userId, accessToken, 5)
  await recomputeActivityLoads(userId)
  await recomputeTrainingLoad(userId)
}

export async function deleteActivity(userId: string, activityId: number): Promise<void> {
  await createAdminClient()
    .from('activities')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('external_id', String(activityId))

  await recomputeTrainingLoad(userId)
}
