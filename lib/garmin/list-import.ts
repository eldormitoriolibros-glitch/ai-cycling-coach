import type { ParsedFitActivity } from './fit'
import { garminActivityId } from './incremental-sync'

/** Stored in activities.external_id for Garmin API imports. */
export function garminStoredExternalId(activityId: string | number): string {
  return `garmin-${activityId}`
}

function toSportType(typeKey: string | null | undefined): string {
  const value = (typeKey ?? '').toLowerCase()
  if (value.includes('mountain') || value.includes('mtb')) return 'MountainBikeRide'
  if (value.includes('gravel')) return 'GravelRide'
  if (value.includes('indoor') || value.includes('virtual')) return 'VirtualRide'
  if (
    value.includes('cycling') ||
    value.includes('ride') ||
    value.includes('bike') ||
    value.includes('cycl')
  ) {
    return 'Ride'
  }
  return 'Workout'
}

/**
 * Garmin list timestamps are often "2026-08-30 07:45:00" with no zone.
 * startTimeGMT must be read as UTC; beginTimestamp (ms) is preferred.
 */
export function parseGarminListStart(activity: any): Date | null {
  const ts = activity?.beginTimestamp
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    const ms = ts < 1e12 ? ts * 1000 : ts
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 2000) return d
  }

  const gmt = parseGarminDateString(activity?.startTimeGMT, true)
  if (gmt) return gmt
  return parseGarminDateString(activity?.startTimeLocal, false)
}

export function parseGarminDateString(value: unknown, assumeUtc: boolean): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim().includes('T') ? value.trim() : value.trim().replace(' ', 'T')
  if (assumeUtc && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const utc = new Date(`${normalized}Z`)
    if (!Number.isNaN(utc.getTime()) && utc.getUTCFullYear() >= 2000) return utc
  }
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 2000) return null
  return parsed
}

/** Garmin list API returns seconds; some payloads use milliseconds. */
export function durationSecondsFromList(activity: any): number | null {
  const raw =
    activity?.movingDuration ?? activity?.duration ?? activity?.elapsedDuration ?? null
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null
  const n = Number(raw)
  // > 36h in "seconds" is almost certainly milliseconds.
  return Math.round(n > 129_600 ? n / 1000 : n)
}

/** Build a ParsedFitActivity from the Garmin activity list row (no per-second samples). */
export function listActivityToParsedFit(activity: any): ParsedFitActivity | null {
  const id = garminActivityId(activity)
  const start = parseGarminListStart(activity)
  const durationSeconds = durationSecondsFromList(activity)
  if (!id || !start || !durationSeconds) return null

  const readNum = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null

  return {
    garminActivityId: id,
    startTime: start.toISOString(),
    title: activity.activityName ?? null,
    activityType: activity.activityType?.typeKey ?? null,
    sportType: toSportType(activity.activityType?.typeKey),
    durationSeconds,
    distanceMeters: readNum(activity.distance),
    avgSpeed: readNum(activity.averageSpeed),
    maxSpeed: readNum(activity.maxSpeed),
    avgHr: readNum(activity.averageHR),
    maxHr: readNum(activity.maxHR),
    avgCadence: readNum(activity.averageBikingCadenceInRevPerMinute),
    maxCadence: readNum(activity.maxBikingCadenceInRevPerMinute),
    elevationGain: readNum(activity.elevationGain),
    avgPower: readNum(activity.avgPower),
    maxPower: readNum(activity.maxPower),
    kilojoules: null,
    hasPowerMeter: readNum(activity.avgPower) != null,
    avgTemperature: readNum(activity.averageTemperature) ?? readNum(activity.minTemperature),
    maxTemperature: readNum(activity.maxTemperature),
    trainingEffectAerobic: readNum(activity.aerobicTrainingEffect),
    trainingEffectAnaerobic: readNum(activity.anaerobicTrainingEffect),
    avgRespirationRate: readNum(activity.avgRespirationRate),
    calories: readNum(activity.calories),
    sweatLossMl: readNum(activity.waterEstimated),
    garminTrainingLoad: readNum(activity.activityTrainingLoad),
    records: [],
  }
}
