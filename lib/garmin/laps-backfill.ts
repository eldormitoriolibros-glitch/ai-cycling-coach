import { createAdminClient } from '@/lib/supabase/admin'
import { getGarminClient } from './client'
import { downloadActivityFits, garminActivityId } from './activity-sync'
import { saveActivityLaps } from './laps-store'
import { garminStoredExternalId } from './list-import'

import 'server-only'

/**
 * Activities pulled from the Garmin list per request. Small on purpose: in the
 * worst case every one of them needs a FIT download, and the cursor only moves
 * once the whole page is processed.
 */
const PAGE_SIZE = 12

export type LapsBackfillResult = {
  cursor: number
  done: boolean
  scanned: number
  downloaded: number
  activitiesWithLaps: number
  lapsStored: number
  failures: number
  error?: string
}

/**
 * Pulls lap splits for rides that are already imported, one page at a time so
 * the caller can walk the whole history without hitting the request timeout.
 * The incremental sync skips activities it has seen before, so without this the
 * laps of past rides would never arrive.
 */
export async function backfillGarminLaps(
  userId: string,
  cursor = 0
): Promise<LapsBackfillResult> {
  const result: LapsBackfillResult = {
    cursor,
    done: false,
    scanned: 0,
    downloaded: 0,
    activitiesWithLaps: 0,
    lapsStored: 0,
    failures: 0,
  }

  const garmin = await getGarminClient(userId)
  if (!garmin) return { ...result, done: true, error: 'No hay conexión con Garmin.' }

  const supabase = createAdminClient()
  const listed = (await garmin.client.getActivities(cursor, PAGE_SIZE)) ?? []
  result.scanned = listed.length

  if (listed.length === 0) {
    return { ...result, cursor, done: true }
  }

  // Garmin's list usually carries lapCount, which lets us skip rides with no
  // splits without paying for a FIT download.
  const candidates = listed.filter((a: any) => {
    const count = typeof a?.lapCount === 'number' ? a.lapCount : null
    return count === null || count > 1
  })

  const byExternalId = new Map<string, any>()
  for (const activity of candidates) {
    const id = garminActivityId(activity)
    if (id) byExternalId.set(garminStoredExternalId(id), activity)
  }

  const nextCursor = cursor + listed.length
  const done = listed.length < PAGE_SIZE
  if (byExternalId.size === 0) return { ...result, cursor: nextCursor, done }

  const { data: rows } = await supabase
    .from('activities')
    .select('id, external_id')
    .eq('user_id', userId)
    .eq('source', 'garmin')
    .in('external_id', Array.from(byExternalId.keys()))

  if (!rows?.length) return { ...result, cursor: nextCursor, done }

  const { data: existingLaps } = await supabase
    .from('activity_laps')
    .select('activity_id')
    .in('activity_id', rows.map((r) => r.id))

  const alreadyStored = new Set((existingLaps ?? []).map((l) => l.activity_id))

  for (const row of rows) {
    if (alreadyStored.has(row.id) || !row.external_id) continue
    const activity = byExternalId.get(row.external_id)
    if (!activity) continue

    try {
      const fits = await downloadActivityFits(garmin.client, activity)
      result.downloaded++
      const laps = fits.flatMap((fit) => fit.laps)
      const stored = await saveActivityLaps(userId, row.id, laps)
      if (stored > 0) {
        result.activitiesWithLaps++
        result.lapsStored += stored
      }
    } catch {
      result.failures++
    }
  }

  await garmin.saveTokens().catch(() => {})
  return { ...result, cursor: nextCursor, done }
}
