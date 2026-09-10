const TIME_WINDOW_MS = 4 * 60 * 60 * 1000
/** CSV imports often store local wall-clock as UTC; vs Garmin that is ~3–5h off. */
const CROSS_SOURCE_TIME_WINDOW_MS = 6 * 60 * 60 * 1000
const DISTANCE_TOLERANCE_RATIO = 0.015
const DISTANCE_TOLERANCE_MIN_M = 250
const DURATION_TOLERANCE_S = 300
const CRUMB_MAX_METERS = 800
const CRUMB_MAX_SECONDS = 4 * 60
const MAIN_MIN_METERS = 8_000

export type DuplicateCandidate = {
  id: string
  source: string
  start_time: string
  distance_meters: number | null
  moving_seconds: number | null
  duration_seconds: number | null
  created_at: string
  sample_count?: number
}

function durationOf(row: DuplicateCandidate): number | null {
  return row.moving_seconds ?? row.duration_seconds
}

function timeWindowMs(a: DuplicateCandidate, b: DuplicateCandidate): number {
  return a.source !== b.source ? CROSS_SOURCE_TIME_WINDOW_MS : TIME_WINDOW_MS
}

export function isSameRide(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  const startDelta = Math.abs(new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  if (Number.isNaN(startDelta) || startDelta > timeWindowMs(a, b)) return false

  const da = a.distance_meters
  const db = b.distance_meters
  if (da != null && db != null) {
    const allowed = Math.max(DISTANCE_TOLERANCE_MIN_M, da * DISTANCE_TOLERANCE_RATIO)
    return Math.abs(da - db) <= allowed
  }

  const ta = durationOf(a)
  const tb = durationOf(b)
  if (ta != null && tb != null) return Math.abs(ta - tb) <= DURATION_TOLERANCE_S
  return startDelta <= 5 * 60 * 1000
}

function keepScore(row: DuplicateCandidate): number {
  let score = 0
  if ((row.sample_count ?? 0) > 0) score += 1_000
  if (row.source === 'strava' || row.source === 'garmin') score += 10
  const created = new Date(row.created_at).getTime()
  if (Number.isFinite(created)) score += Math.max(0, 2e12 - created) / 1e10
  return score
}

function utcDay(iso: string): string {
  return iso.slice(0, 10)
}

function isCrumb(row: DuplicateCandidate): boolean {
  const meters = row.distance_meters ?? 0
  const seconds = durationOf(row) ?? 0
  return meters < CRUMB_MAX_METERS && seconds < CRUMB_MAX_SECONDS
}

/**
 * Garmin's CSV export often includes a leftover 100–500 m "Ciclismo" next to
 * the real ride (no HR, 1–3 minutes). The calendar shows them as a second
 * outing. Drop the fragment when that day already has a proper ride.
 */
export function pickSatelliteCrumbs(rows: DuplicateCandidate[]): string[] {
  const byDay = new Map<string, DuplicateCandidate[]>()
  for (const row of rows) {
    const day = utcDay(row.start_time)
    const list = byDay.get(day) ?? []
    list.push(row)
    byDay.set(day, list)
  }

  const doomed: string[] = []
  for (const dayRows of Array.from(byDay.values())) {
    const hasMain = dayRows.some((row) => (row.distance_meters ?? 0) >= MAIN_MIN_METERS)
    if (!hasMain) continue
    for (const row of dayRows) {
      if (isCrumb(row)) doomed.push(row.id)
    }
  }
  return doomed
}

/** Returns ids that should be deleted so each ride is stored once. */
export function pickDuplicateLosers(rows: DuplicateCandidate[]): string[] {
  const losers = new Set(pickSatelliteCrumbs(rows))
  const sorted = [...rows].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  for (let i = 0; i < sorted.length; i++) {
    if (losers.has(sorted[i].id)) continue
    for (let j = i + 1; j < sorted.length; j++) {
      if (losers.has(sorted[j].id)) continue
      const later = new Date(sorted[j].start_time).getTime()
      const earlier = new Date(sorted[i].start_time).getTime()
      if (later - earlier > CROSS_SOURCE_TIME_WINDOW_MS) break
      if (!isSameRide(sorted[i], sorted[j])) continue

      const drop = keepScore(sorted[i]) >= keepScore(sorted[j]) ? sorted[j] : sorted[i]
      losers.add(drop.id)
      if (drop.id === sorted[i].id) break
    }
  }

  return Array.from(losers)
}
