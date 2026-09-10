import { createAdminClient } from '@/lib/supabase/admin'
import { syncActivities } from '@/lib/strava/sync'
import { removeDuplicateActivities } from '@/lib/training/dedupe'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'
import { loadThresholds, upsertGarminListActivities } from './activity-sync'
import { getGarminClient } from './client'
import { shouldKeepListedRide } from './laps-select'
import { listActivityToParsedFit } from './list-import'

import 'server-only'

const PAGE_SIZE = 50

export type RebuildPageResult = {
  cursor: number
  done: boolean
  scanned: number
  imported: number
  skipped: number
  csvRemoved: number
  duplicatesRemoved: number
  stravaSynced: number
  error?: string
}

/**
 * Rebuilds the calendar from Garmin's activity list (no FIT download), then
 * drops the old CSV leftovers and fills gaps from Strava without copying a
 * ride that Garmin already has.
 */
export async function rebuildCalendarPage(
  userId: string,
  cursor = 0
): Promise<RebuildPageResult> {
  const result: RebuildPageResult = {
    cursor,
    done: false,
    scanned: 0,
    imported: 0,
    skipped: 0,
    csvRemoved: 0,
    duplicatesRemoved: 0,
    stravaSynced: 0,
  }

  const garmin = await getGarminClient(userId)
  if (!garmin) return { ...result, done: true, error: 'No hay conexión con Garmin.' }

  const listed = (await garmin.client.getActivities(cursor, PAGE_SIZE)) ?? []
  result.scanned = listed.length

  const nextCursor = cursor + listed.length
  const done = listed.length < PAGE_SIZE

  const keep = listed.filter(shouldKeepListedRide)
  result.skipped = listed.length - keep.length

  const parsed = keep.map(listActivityToParsedFit).filter((row): row is NonNullable<typeof row> => row != null)
  if (parsed.length) {
    const thresholds = await loadThresholds(userId)
    const totals = await upsertGarminListActivities(userId, parsed, thresholds)
    result.imported = totals.created + totals.enriched
  }

  await garmin.saveTokens().catch(() => {})

  if (!done) return { ...result, cursor: nextCursor, done: false }

  result.csvRemoved = await deleteGarminCsvLeftovers(userId)
  result.duplicatesRemoved = await removeDuplicateActivities(userId)

  const strava = await syncActivities(userId, 'manual', {
    full: true,
    afterDays: 1000,
    skipStreams: true,
  }).catch(() => null)
  result.stravaSynced = strava?.synced ?? 0
  result.duplicatesRemoved += await removeDuplicateActivities(userId)

  await recomputeActivityLoads(userId).catch(() => {})
  await recomputeTrainingLoad(userId).catch(() => {})

  return { ...result, cursor: nextCursor, done: true }
}

/** The 2024 CSV dump is the junk source. Garmin list rows replace it. */
async function deleteGarminCsvLeftovers(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'manual')
    .like('external_id', 'garmin-csv-%')

  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return 0

  for (let i = 0; i < ids.length; i += 200) {
    await supabase.from('activities').delete().in('id', ids.slice(i, i + 200))
  }
  return ids.length
}
