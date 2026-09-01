const TIME_WINDOW_MS = 4 * 60 * 60 * 1000
const DISTANCE_TOLERANCE_RATIO = 0.015
const DISTANCE_TOLERANCE_MIN_M = 250
const DURATION_TOLERANCE_S = 300

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

export function isSameRide(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  const startDelta = Math.abs(new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  if (Number.isNaN(startDelta) || startDelta > TIME_WINDOW_MS) return false

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

/** Returns ids that should be deleted so each ride is stored once. */
export function pickDuplicateLosers(rows: DuplicateCandidate[]): string[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )
  const losers = new Set<string>()

  for (let i = 0; i < sorted.length; i++) {
    if (losers.has(sorted[i].id)) continue
    for (let j = i + 1; j < sorted.length; j++) {
      if (losers.has(sorted[j].id)) continue
      const later = new Date(sorted[j].start_time).getTime()
      const earlier = new Date(sorted[i].start_time).getTime()
      if (later - earlier > TIME_WINDOW_MS) break
      if (!isSameRide(sorted[i], sorted[j])) continue

      const drop = keepScore(sorted[i]) >= keepScore(sorted[j]) ? sorted[j] : sorted[i]
      losers.add(drop.id)
      if (drop.id === sorted[i].id) break
    }
  }

  return Array.from(losers)
}
