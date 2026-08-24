import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'
import { parseGarminCsv, type GarminRow } from './csv'

import 'server-only'

const METRES_PER_KM = 1000
const METRES_PER_MILE = 1609.344

/** Matching tolerances. Distance and duration together identify a ride uniquely. */
const DISTANCE_TOLERANCE_RATIO = 0.015
const DISTANCE_TOLERANCE_MIN_M = 250
const DURATION_TOLERANCE_S = 300

type Candidate = {
  id: string
  start_time: string
  distance_meters: number | null
  moving_seconds: number | null
  duration_seconds: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
}

export type ImportResult = {
  parsed: number
  withHeartRate: number
  matched: number
  updated: number
  unmatched: number
  unit: 'km' | 'mi'
  activitiesRecalculated: number
}

function durationOf(activity: Candidate): number | null {
  return activity.moving_seconds ?? activity.duration_seconds
}

/**
 * Pairs CSV rows to stored activities on distance + duration rather than
 * timestamp: the Garmin export writes local time with no offset, so the same
 * ride can differ by hours across timezones.
 */
function pair(rows: GarminRow[], activities: Candidate[], metresPerUnit: number) {
  const taken = new Set<string>()
  const pairs: Array<{ activity: Candidate; row: GarminRow }> = []

  for (const row of rows) {
    if (row.distanceMeters === null || row.movingSeconds === null) continue
    const distance = row.distanceMeters * metresPerUnit

    let best: { activity: Candidate; score: number } | null = null

    for (const activity of activities) {
      if (taken.has(activity.id)) continue

      const actDistance = activity.distance_meters
      const actDuration = durationOf(activity)
      if (actDistance === null || actDuration === null) continue

      const distanceDelta = Math.abs(actDistance - distance)
      const durationDelta = Math.abs(actDuration - row.movingSeconds)

      const distanceAllowed = Math.max(DISTANCE_TOLERANCE_MIN_M, distance * DISTANCE_TOLERANCE_RATIO)
      if (distanceDelta > distanceAllowed || durationDelta > DURATION_TOLERANCE_S) continue

      const score = distanceDelta / distanceAllowed + durationDelta / DURATION_TOLERANCE_S
      if (!best || score < best.score) best = { activity, score }
    }

    if (best) {
      taken.add(best.activity.id)
      pairs.push({ activity: best.activity, row })
    }
  }

  return pairs
}

export async function importGarminCsv(userId: string, csvText: string): Promise<ImportResult> {
  const rows = parseGarminCsv(csvText)
  const usable = rows.filter((r) => r.avgHr !== null || r.maxHr !== null)

  const supabase = createAdminClient()

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, start_time, distance_meters, moving_seconds, duration_seconds, avg_hr, max_hr, avg_cadence')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  const candidates = (activities ?? []) as Candidate[]

  // The export uses km or miles depending on the account setting, and never says
  // which. Try both and keep whichever pairs more rides.
  const metric = pair(usable, candidates, METRES_PER_KM)
  const imperial = pair(usable, candidates, METRES_PER_MILE)
  const useMetric = metric.length >= imperial.length
  const pairs = useMetric ? metric : imperial

  let updated = 0

  for (const { activity, row } of pairs) {
    const patch: { avg_hr?: number; max_hr?: number; avg_cadence?: number } = {}
    if (row.avgHr !== null && activity.avg_hr === null) patch.avg_hr = Math.round(row.avgHr)
    if (row.maxHr !== null && activity.max_hr === null) patch.max_hr = Math.round(row.maxHr)
    if (row.avgCadence !== null && activity.avg_cadence === null) {
      patch.avg_cadence = Math.round(row.avgCadence)
    }

    if (Object.keys(patch).length === 0) continue

    const { error: updateError } = await supabase.from('activities').update(patch).eq('id', activity.id)
    if (!updateError) updated++
  }

  const activitiesRecalculated = updated > 0 ? await recomputeActivityLoads(userId) : 0
  if (updated > 0) await recomputeTrainingLoad(userId)

  return {
    parsed: rows.length,
    withHeartRate: usable.length,
    matched: pairs.length,
    updated,
    unmatched: usable.length - pairs.length,
    unit: useMetric ? 'km' : 'mi',
    activitiesRecalculated,
  }
}
