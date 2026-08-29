import { createAdminClient } from '@/lib/supabase/admin'
import { getGarminClient } from './client'
import {
  downloadActivityFits,
  ingestFitActivities,
  loadThresholds,
  type IngestTotals,
} from './activity-sync'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'

import 'server-only'

/**
 * Activities pulled per request. Each one costs a download plus a few thousand
 * sample writes, so the chunk stays small enough to finish inside the function
 * timeout; the caller loops until `done`.
 */
const CHUNK_SIZE = 5

/** Garmin throttles aggressive clients, so downloads are spaced out. */
const DELAY_MS = 800

export type BackfillProgress = {
  status: 'idle' | 'running' | 'done' | 'error'
  cursor: number
  processed: number
  done: boolean
  chunkTotals: IngestTotals
  error?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function resetBackfill(userId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('garmin_connections')
    .update({
      backfill_status: 'running',
      backfill_cursor: 0,
      backfill_processed: 0,
      backfill_error: null,
      backfill_started_at: new Date().toISOString(),
      backfill_finished_at: null,
    } as any)
    .eq('user_id', userId)
}

/**
 * Imports one chunk of historical activities, newest first, resuming from the
 * cursor stored on the connection. Returns progress so the caller can loop.
 */
export async function runBackfillChunk(userId: string): Promise<BackfillProgress> {
  const supabase = createAdminClient()
  const empty: IngestTotals = { enriched: 0, created: 0, samplesAdded: 0, samplesReplaced: 0 }

  const { data: conn } = await supabase
    .from('garmin_connections')
    .select('backfill_cursor, backfill_processed, backfill_status')
    .eq('user_id', userId)
    .maybeSingle()

  if (!conn) {
    return { status: 'error', cursor: 0, processed: 0, done: true, chunkTotals: empty, error: 'Sin conexión Garmin' }
  }

  const cursor = conn.backfill_cursor ?? 0
  const processedSoFar = conn.backfill_processed ?? 0

  let garmin: Awaited<ReturnType<typeof getGarminClient>>
  try {
    garmin = await getGarminClient(userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo cargar la sesión Garmin'
    await supabase
      .from('garmin_connections')
      .update({ backfill_status: 'error', backfill_error: message } as any)
      .eq('user_id', userId)
    return { status: 'error', cursor, processed: processedSoFar, done: true, chunkTotals: empty, error: message }
  }

  if (!garmin) {
    await supabase
      .from('garmin_connections')
      .update({ backfill_status: 'error', backfill_error: 'Sin conexión Garmin' } as any)
      .eq('user_id', userId)
    return { status: 'error', cursor: 0, processed: 0, done: true, chunkTotals: empty, error: 'Sin conexión Garmin' }
  }

  const thresholds = await loadThresholds(userId)

  try {
    const page = await garmin.client.getActivities(cursor, CHUNK_SIZE)
    const activities = page ?? []

    if (activities.length === 0) {
      await supabase
        .from('garmin_connections')
        .update({
          backfill_status: 'done',
          backfill_finished_at: new Date().toISOString(),
        } as any)
        .eq('user_id', userId)

      await recomputeActivityLoads(userId).catch(() => {})
      await recomputeTrainingLoad(userId).catch(() => {})

      return { status: 'done', cursor, processed: processedSoFar, done: true, chunkTotals: empty }
    }

    const totals: IngestTotals = { ...empty }

    for (const activity of activities) {
      try {
        const fits = await downloadActivityFits(garmin.client, activity)
        const result = await ingestFitActivities(userId, fits, thresholds)
        totals.enriched += result.enriched
        totals.created += result.created
        totals.samplesAdded += result.samplesAdded
        totals.samplesReplaced += result.samplesReplaced
      } catch (err) {
        // One bad activity must not abort the whole history.
        console.error('Backfill: activity failed', err)
      }
      await sleep(DELAY_MS)
    }

    const nextCursor = cursor + activities.length
    const nextProcessed = processedSoFar + activities.length
    // A short page means Garmin has no more history past this point.
    const finished = activities.length < CHUNK_SIZE

    await supabase
      .from('garmin_connections')
      .update({
        backfill_cursor: nextCursor,
        backfill_processed: nextProcessed,
        backfill_status: finished ? 'done' : 'running',
        backfill_finished_at: finished ? new Date().toISOString() : null,
      } as any)
      .eq('user_id', userId)

    await garmin.saveTokens().catch(() => {})

    if (finished) {
      await recomputeActivityLoads(userId).catch(() => {})
      await recomputeTrainingLoad(userId).catch(() => {})
    }

    return {
      status: finished ? 'done' : 'running',
      cursor: nextCursor,
      processed: nextProcessed,
      done: finished,
      chunkTotals: totals,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    await supabase
      .from('garmin_connections')
      .update({ backfill_status: 'error', backfill_error: message } as any)
      .eq('user_id', userId)

    return { status: 'error', cursor, processed: processedSoFar, done: true, chunkTotals: empty, error: message }
  }
}
