import { createAdminClient } from '@/lib/supabase/admin'
import { zonedTimeToUtc } from '@/lib/training/dates'
import { removeDuplicateManualActivities } from '@/lib/training/dedupe'
import { estimateTrainingLoad } from '@/lib/training/load'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'
import { parseGarminCsv, type GarminRow } from './csv'

import 'server-only'

const METRES_PER_KM = 1000
const METRES_PER_MILE = 1609.344
const METRES_PER_FOOT = 0.3048

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
  created: number
  removedDuplicates: number
  unmatched: number
  unit: 'km' | 'mi'
  activitiesRecalculated: number
}

export type ImportOptions = { createMissing?: boolean }

/** Garmin localises the activity type; map the common cycling ones to Strava's vocabulary. */
function toSportType(activityType: string | null): string {
  const value = (activityType ?? '').toLowerCase()
  if (value.includes('montaña') || value.includes('mountain') || value.includes('mtb')) {
    return 'MountainBikeRide'
  }
  if (value.includes('gravel')) return 'GravelRide'
  if (value.includes('interior') || value.includes('indoor') || value.includes('virtual')) {
    return 'VirtualRide'
  }
  if (value.includes('cicl') || value.includes('bike') || value.includes('cycl') || value.includes('ride')) {
    return 'Ride'
  }
  return 'Workout'
}

/** Stable per-start-time id so re-importing the same file updates instead of duplicating. */
function externalId(row: GarminRow): string {
  return `garmin-csv-${row.startLocal.replace(/\D/g, '')}`
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

export async function importGarminCsv(
  userId: string,
  csvText: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const rows = parseGarminCsv(csvText)
  const usable = rows.filter((r) => r.avgHr !== null || r.maxHr !== null)

  const supabase = createAdminClient()

  const [{ data: activities, error }, { data: profile }, { data: metrics }] = await Promise.all([
    supabase
      .from('activities')
      .select('id, start_time, distance_meters, moving_seconds, duration_seconds, avg_hr, max_hr, avg_cadence')
      .eq('user_id', userId),
    supabase.from('users').select('timezone').eq('id', userId).maybeSingle(),
    supabase.from('athlete_metrics').select('ftp, max_hr, resting_hr').eq('user_id', userId).maybeSingle(),
  ])

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

  let created = 0

  if (options.createMissing) {
    const timeZone = profile?.timezone || 'UTC'
    const metresPerUnit = useMetric ? METRES_PER_KM : METRES_PER_MILE
    const paired = new Set(pairs.map((p) => p.row))

    const inserts = rows
      .filter((row) => !paired.has(row))
      .flatMap((row) => {
        const startedAt = zonedTimeToUtc(row.startLocal, timeZone)
        if (Number.isNaN(startedAt.getTime())) return []

        const movingSeconds = row.movingSeconds
        const durationSeconds = row.elapsedSeconds ?? movingSeconds
        if (!movingSeconds && !durationSeconds) return []

        const { trainingLoad, intensityFactor } = estimateTrainingLoad({
          durationSeconds: movingSeconds ?? durationSeconds,
          normalizedPower: null,
          averagePower: null,
          averageHr: row.avgHr,
          ftp: metrics?.ftp ?? null,
          maxHr: metrics?.max_hr ?? null,
          restingHr: metrics?.resting_hr ?? null,
        })

        // Speed columns follow the same unit system as distance.
        const speedFactor = useMetric ? 1 / 3.6 : METRES_PER_MILE / 3600

        return [
          {
            user_id: userId,
            source: 'manual' as const,
            external_id: externalId(row),
            activity_type: row.activityType,
            sport_type: toSportType(row.activityType),
            title: row.title,
            start_time: startedAt.toISOString(),
            timezone: timeZone,
            duration_seconds: durationSeconds,
            moving_seconds: movingSeconds,
            distance_meters: row.distanceMeters === null ? null : row.distanceMeters * metresPerUnit,
            elevation_gain_meters:
              row.elevationGain === null ? null : row.elevationGain * (useMetric ? 1 : METRES_PER_FOOT),
            avg_speed: row.avgSpeed === null ? null : row.avgSpeed * speedFactor,
            max_speed: row.maxSpeed === null ? null : row.maxSpeed * speedFactor,
            avg_hr: row.avgHr === null ? null : Math.round(row.avgHr),
            max_hr: row.maxHr === null ? null : Math.round(row.maxHr),
            avg_cadence: row.avgCadence === null ? null : Math.round(row.avgCadence),
            max_cadence: row.maxCadence === null ? null : Math.round(row.maxCadence),
            training_load: trainingLoad,
            intensity_factor: intensityFactor,
          },
        ]
      })

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('activities')
        .upsert(inserts, { onConflict: 'user_id,source,external_id' })

      if (insertError) throw new Error(insertError.message)
      created = inserts.length
    }
  }

  const removedDuplicates = created > 0 ? await removeDuplicateManualActivities(userId) : 0
  const touched = updated + created

  const activitiesRecalculated = touched > 0 ? await recomputeActivityLoads(userId) : 0
  if (touched > 0) await recomputeTrainingLoad(userId)

  return {
    parsed: rows.length,
    withHeartRate: usable.length,
    matched: pairs.length,
    updated,
    created: created - removedDuplicates,
    removedDuplicates,
    unmatched: usable.length - pairs.length,
    unit: useMetric ? 'km' : 'mi',
    activitiesRecalculated,
  }
}
