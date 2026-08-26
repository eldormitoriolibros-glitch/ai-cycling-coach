import FitParser from 'fit-file-parser'
import { estimateTrainingLoad } from '@/lib/training/load'
import { zonedTimeToUtc } from '@/lib/training/dates'

import 'server-only'

export type ParsedFitActivity = {
  startTime: string
  title: string | null
  activityType: string | null
  sportType: string | null
  durationSeconds: number | null
  distanceMeters: number | null
  avgSpeed: number | null
  maxSpeed: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  elevationGain: number | null
  records: FitRecordSample[]
}

/** One per-second record from the FIT file, used to build activity_samples. */
export type FitRecordSample = {
  offsetSeconds: number
  heartRate: number | null
  power: number | null
  cadence: number | null
  speed: number | null
  elevation: number | null
  temperature: number | null
  latitude: number | null
  longitude: number | null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asIsoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) {
    const maybe = new Date(value * 1000)
    return Number.isNaN(maybe.getTime()) ? null : maybe.toISOString()
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

function normalizeSport(value: string | null): string | null {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('mtb') || normalized.includes('mountain')) return 'MountainBikeRide'
  if (normalized.includes('gravel')) return 'GravelRide'
  if (normalized.includes('virtual') || normalized.includes('indoor')) return 'VirtualRide'
  if (normalized.includes('ride') || normalized.includes('bike') || normalized.includes('cycl')) return 'Ride'
  return value
}

/** Per-second records that fall within a session's [start, start + duration] window. */
function extractSessionRecords(
  records: Array<Record<string, unknown>>,
  session: Record<string, unknown>
): FitRecordSample[] {
  const startTime = session.start_time instanceof Date ? session.start_time : new Date(String(session.start_time))
  if (Number.isNaN(startTime.getTime())) return []

  const durationSeconds =
    readNumber(session.total_elapsed_time) ?? readNumber(session.total_timer_time) ?? null
  const endTime = new Date(startTime.getTime() + (durationSeconds ?? 24 * 3600) * 1000 + 5000)

  return records
    .filter((r) => r.timestamp instanceof Date && r.timestamp >= startTime && r.timestamp <= endTime)
    .map((r) => {
      const ts = r.timestamp as Date
      return {
        offsetSeconds: Math.round((ts.getTime() - startTime.getTime()) / 1000),
        heartRate: readNumber(r.heart_rate),
        power: readNumber(r.power),
        cadence: readNumber(r.cadence),
        speed: readNumber(r.speed) ?? readNumber(r.enhanced_speed),
        elevation: readNumber(r.altitude) ?? readNumber(r.enhanced_altitude),
        temperature: readNumber(r.temperature),
        latitude: readNumber(r.position_lat),
        longitude: readNumber(r.position_long),
      }
    })
}

export async function parseFitFile(buffer: ArrayBuffer | Buffer): Promise<ParsedFitActivity[]> {
  const parser = new FitParser({
    mode: 'list',
    speedUnit: 'm/s',
    lengthUnit: 'm',
    elapsedRecordField: true,
  })

  const input =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

  const data = (await parser.parseAsync(input as ArrayBuffer)) as {
    sessions?: Array<Record<string, unknown>>
    records?: Array<Record<string, unknown>>
    messages?: Record<string, unknown[]>
  }

  const sessions = Array.isArray(data?.sessions) ? data.sessions : []
  if (sessions.length === 0) return []

  const records = Array.isArray(data?.records) ? data.records : []

  return sessions.map((session) => {
    const startTime = asIsoDate(session.start_time)
    const durationSeconds =
      readNumber(session.total_elapsed_time) ?? readNumber(session.total_timer_time) ?? null
    const distanceMeters = readNumber(session.total_distance) ?? readNumber(session.distance)
    const avgHr =
      readNumber(session.avg_heart_rate) ??
      readNumber(session.avg_hr) ??
      readNumber(session.average_heart_rate) ??
      null
    const maxHr =
      readNumber(session.max_heart_rate) ?? readNumber(session.max_hr) ?? null
    const avgCadence = readNumber(session.avg_cadence) ?? readNumber(session.average_cadence) ?? null
    const maxCadence = readNumber(session.max_cadence) ?? readNumber(session.maximum_cadence) ?? null
    const avgSpeed = readNumber(session.avg_speed) ?? readNumber(session.average_speed) ?? null
    const maxSpeed = readNumber(session.max_speed) ?? readNumber(session.maximum_speed) ?? null
    const elevationGain = readNumber(session.total_ascent) ?? readNumber(session.total_elevation_gain) ?? null

    return {
      startTime: startTime ?? new Date(0).toISOString(),
      title: readString(session.name) ?? readString(session.message) ?? null,
      activityType: readString(session.sport) ?? readString(session.activity_type) ?? null,
      sportType: normalizeSport(readString(session.sport) ?? readString(session.activity_type)),
      durationSeconds,
      distanceMeters,
      avgSpeed,
      maxSpeed,
      avgHr,
      maxHr,
      avgCadence,
      maxCadence,
      elevationGain,
      records: extractSessionRecords(records, session),
    }
  })
}

export async function buildFitImportRows(
  userId: string,
  activities: ParsedFitActivity[],
  timeZone: string,
  ftp: number | null,
  maxHr: number | null,
  restingHr: number | null
) {
  return activities.flatMap((activity) => {
    const startedAt = new Date(activity.startTime)
    if (Number.isNaN(startedAt.getTime())) return []

    const localized = zonedTimeToUtc(startedAt.toISOString().slice(0, 19).replace('T', ' '), timeZone)
    const durationSeconds = activity.durationSeconds ?? 0
    if (!durationSeconds) return []

    const { trainingLoad, intensityFactor } = estimateTrainingLoad({
      durationSeconds,
      normalizedPower: null,
      averagePower: null,
      averageHr: activity.avgHr,
      ftp,
      maxHr,
      restingHr,
    })

    const externalId = `fit-${startedAt.getTime()}`

    return [
      {
        row: {
          user_id: userId,
          source: 'manual' as const,
          external_id: externalId,
          activity_type: activity.activityType,
          sport_type: activity.sportType,
          title: activity.title,
          start_time: localized.toISOString(),
          timezone: timeZone,
          duration_seconds: durationSeconds,
          moving_seconds: durationSeconds,
          distance_meters: activity.distanceMeters,
          elevation_gain_meters: activity.elevationGain,
          avg_speed: activity.avgSpeed,
          max_speed: activity.maxSpeed,
          avg_hr: activity.avgHr === null ? null : Math.round(activity.avgHr),
          max_hr: activity.maxHr === null ? null : Math.round(activity.maxHr),
          avg_cadence: activity.avgCadence === null ? null : Math.round(activity.avgCadence),
          max_cadence: activity.maxCadence === null ? null : Math.round(activity.maxCadence),
          training_load: trainingLoad,
          intensity_factor: intensityFactor,
        },
        externalId,
        records: activity.records,
      },
    ]
  })
}
