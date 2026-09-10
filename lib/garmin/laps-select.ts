import { garminActivityId } from './incremental-sync'
import { garminStoredExternalId, listActivityToParsedFit, parseGarminListStart } from './list-import'

const MATCH_WINDOW_MS = 10 * 60 * 1000

export type NearbyActivity = { id: string; external_id: string | null; start_time: string }

export function listedLapCount(activity: any): number | null {
  for (const value of [activity?.lapCount, activity?.numberOfActivityLaps, activity?.laps]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

export function isCyclingActivity(activity: any): boolean {
  const key = String(activity?.activityType?.typeKey ?? activity?.activityType?.type ?? '').toLowerCase()
  return /cycl|ride|bike|virtual|gravel|mtb/.test(key)
}

const CRUMB_MAX_METERS = 800
const CRUMB_MAX_SECONDS = 4 * 60

/**
 * Calendar rides: bikes only, and skip the leftover 100–500 m files Garmin
 * leaves next to a real outing. Those are what made 2024 look like two rides
 * a day.
 */
export function shouldKeepListedRide(activity: any): boolean {
  if (!isCyclingActivity(activity)) return false
  const parsed = listActivityToParsedFit(activity)
  if (!parsed) return false
  const meters = parsed.distanceMeters ?? 0
  const seconds = parsed.durationSeconds ?? 0
  if (meters < CRUMB_MAX_METERS && seconds < CRUMB_MAX_SECONDS) return false
  return true
}

/**
 * Download the FIT when Garmin reports splits, or for any bike ride already in
 * the app. The list's lapCount is often 1 even on interval rides, so treating
 * it as a hard skip left almost the whole history empty.
 */
export function shouldDownloadLaps(activity: any): boolean {
  const count = listedLapCount(activity)
  if (count != null && count > 1) return true
  return isCyclingActivity(activity)
}

export function matchListedActivity(activity: any, rows: NearbyActivity[]): NearbyActivity | null {
  const id = garminActivityId(activity)
  if (id) {
    const stored = garminStoredExternalId(id)
    const exact = rows.find((row) => row.external_id === stored)
    if (exact) return exact
  }

  const start = parseGarminListStart(activity)
  if (!start) return null

  let best: NearbyActivity | null = null
  let bestDelta = MATCH_WINDOW_MS
  for (const row of rows) {
    const delta = Math.abs(new Date(row.start_time).getTime() - start.getTime())
    if (delta <= bestDelta) {
      best = row
      bestDelta = delta
    }
  }
  return best
}

export { MATCH_WINDOW_MS }
