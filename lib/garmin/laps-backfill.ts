import { createAdminClient } from '@/lib/supabase/admin'
import { getGarminClient } from './client'
import { downloadActivityFits, garminActivityId } from './activity-sync'
import { saveActivityLaps } from './laps-store'
import { garminStoredExternalId, parseGarminListStart } from './list-import'
import {
  MATCH_WINDOW_MS,
  matchListedActivity,
  shouldDownloadLaps,
  type NearbyActivity,
} from './laps-select'

import 'server-only'

/**
 * Activities pulled from the Garmin list per request. Small on purpose: in the
 * worst case every cycling ride on the page needs a FIT download, and the
 * cursor only moves once the whole page is processed.
 */
const PAGE_SIZE = 12

export type LapsBackfillResult = {
  cursor: number
  done: boolean
  scanned: number
  inApp: number
  notInApp: number
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
    inApp: 0,
    notInApp: 0,
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

  const nextCursor = cursor + listed.length
  const done = listed.length < PAGE_SIZE
  const candidates = listed.filter(shouldDownloadLaps)

  const nearby = await loadNearbyActivities(userId, listed)
  const { data: existingLaps } = nearby.length
    ? await supabase.from('activity_laps').select('activity_id').in('activity_id', nearby.map((r) => r.id))
    : { data: [] }
  const alreadyStored = new Set((existingLaps ?? []).map((l) => l.activity_id))

  for (const activity of candidates) {
    const row = matchListedActivity(activity, nearby)
    if (!row) {
      result.notInApp++
      continue
    }
    result.inApp++
    if (alreadyStored.has(row.id)) continue

    try {
      const fits = await downloadActivityFits(garmin.client, activity)
      result.downloaded++
      const laps = fits.flatMap((fit) => fit.laps)
      const stored = await saveActivityLaps(userId, row.id, laps)
      if (stored > 0) {
        result.activitiesWithLaps++
        result.lapsStored += stored
        alreadyStored.add(row.id)
      }
    } catch {
      result.failures++
    }
  }

  await garmin.saveTokens().catch(() => {})
  return { ...result, cursor: nextCursor, done }
}

async function loadNearbyActivities(userId: string, listed: any[]): Promise<NearbyActivity[]> {
  const supabase = createAdminClient()
  const ids = listed.map((a) => garminActivityId(a)).filter((id): id is string => Boolean(id))
  const starts = listed.map(parseGarminListStart).filter((d): d is Date => d != null)

  const byId =
    ids.length === 0
      ? { data: [] as NearbyActivity[] }
      : await supabase
          .from('activities')
          .select('id, external_id, start_time')
          .eq('user_id', userId)
          .in('external_id', ids.map(garminStoredExternalId))

  let byTime: NearbyActivity[] = []
  if (starts.length) {
    const min = new Date(Math.min(...starts.map((d) => d.getTime())) - MATCH_WINDOW_MS).toISOString()
    const max = new Date(Math.max(...starts.map((d) => d.getTime())) + MATCH_WINDOW_MS).toISOString()
    const { data } = await supabase
      .from('activities')
      .select('id, external_id, start_time')
      .eq('user_id', userId)
      .gte('start_time', min)
      .lte('start_time', max)
    byTime = (data ?? []) as NearbyActivity[]
  }

  const seen = new Set<string>()
  const rows: NearbyActivity[] = []
  for (const row of [...((byId.data ?? []) as NearbyActivity[]), ...byTime]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }
  return rows
}
