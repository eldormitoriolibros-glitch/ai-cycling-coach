/** Garmin's list endpoint exposes the id under a couple of different keys. */
export function garminActivityId(activity: any): string | null {
  const id = activity?.activityId ?? activity?.activityid ?? activity?.id
  return id == null ? null : String(id)
}

/**
 * Picks Garmin list rows worth downloading on incremental sync. We skip ids
 * already imported as source=garmin; everything else in the recent window is
 * fetched so new rides and Strava-only rows waiting for FIT enrichment are
 * both covered.
 */
export function selectActivitiesForIncrementalSync(
  activities: any[],
  existingGarminIds: Set<string>,
  options?: { lookbackDays?: number; now?: Date }
): any[] {
  const lookbackDays = options?.lookbackDays ?? 21
  const now = options?.now ?? new Date()
  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000)

  return (activities ?? []).filter((activity) => {
    const id = garminActivityId(activity)
    if (!id || existingGarminIds.has(id)) return false

    const start = parseListStart(activity)
    if (!start) return true
    return start >= cutoff
  })
}

function parseListStart(activity: any): Date | null {
  const ts = activity?.beginTimestamp
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    const ms = ts < 1e12 ? ts * 1000 : ts
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d
  }
  const raw = activity.startTimeGMT || activity.startTimeLocal
  if (!raw) return null
  const normalized = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T')
  const asUtc = activity.startTimeGMT && !/[zZ]|[+-]\d{2}/.test(String(activity.startTimeGMT))
    ? new Date(`${normalized}Z`)
    : new Date(normalized)
  return Number.isNaN(asUtc.getTime()) ? null : asUtc
}
