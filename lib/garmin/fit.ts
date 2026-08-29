import FitParser from 'fit-file-parser'
import { estimateTrainingLoad } from '@/lib/training/load'
import type { ActivitySource } from '@/lib/types/database'

import 'server-only'

export type ParsedFitActivity = {
  /**
   * Garmin's own activity id, set when the FIT came from the Garmin API. Gives
   * imported rows a stable external_id so re-syncing can never duplicate them.
   */
  garminActivityId?: string | null
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
  avgPower: number | null
  maxPower: number | null
  kilojoules: number | null
  hasPowerMeter: boolean
  avgTemperature: number | null
  maxTemperature: number | null
  trainingEffectAerobic: number | null
  trainingEffectAnaerobic: number | null
  avgRespirationRate: number | null
  calories: number | null
  sweatLossMl: number | null
  garminTrainingLoad: number | null
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
  respirationRate: number | null
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
        respirationRate: readNumber(r.respiration_rate) ?? readNumber(r.enhanced_respiration_rate) ?? null,
        latitude: readNumber(r.position_lat),
        longitude: readNumber(r.position_long),
      }
    })
}

async function runParser(buffer: ArrayBuffer | Buffer) {
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

  return (await parser.parseAsync(input as ArrayBuffer)) as unknown as {
    sessions?: Array<Record<string, unknown>>
    records?: Array<Record<string, unknown>>
    laps?: Array<Record<string, unknown>>
  } & Record<string, unknown>
}

/**
 * Structural summary of a FIT file, used by the import diagnostics to tell an
 * activity file apart from the METRICS/WELLNESS/MONITORING files Garmin ships
 * alongside it (those carry no session and no ride to import).
 */
export async function inspectFitFile(buffer: ArrayBuffer | Buffer): Promise<{
  sessionCount: number
  recordCount: number
  lapCount: number
  topLevelKeys: string[]
}> {
  const data = await runParser(buffer)
  return {
    sessionCount: Array.isArray(data?.sessions) ? data.sessions.length : 0,
    recordCount: Array.isArray(data?.records) ? data.records.length : 0,
    lapCount: Array.isArray(data?.laps) ? data.laps.length : 0,
    topLevelKeys: Object.keys(data ?? {})
      .filter((k) => {
        const v = (data as Record<string, unknown>)[k]
        return Array.isArray(v) ? v.length > 0 : v != null
      })
      .sort(),
  }
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/**
 * Builds an activity from raw records when the file has no `session` message.
 * Some exports and third-party tools omit it, and without this the whole file
 * is discarded even though every per-second stream is present.
 */
function activityFromRecords(records: Array<Record<string, unknown>>): ParsedFitActivity | null {
  const timed = records.filter((r) => r.timestamp instanceof Date)
  if (timed.length < 2) return null

  timed.sort((a, b) => (a.timestamp as Date).getTime() - (b.timestamp as Date).getTime())
  const start = timed[0].timestamp as Date
  const end = timed[timed.length - 1].timestamp as Date

  const samples = timed.map((r) => {
    const ts = r.timestamp as Date
    return {
      offsetSeconds: Math.round((ts.getTime() - start.getTime()) / 1000),
      heartRate: readNumber(r.heart_rate),
      power: readNumber(r.power),
      cadence: readNumber(r.cadence),
      speed: readNumber(r.speed) ?? readNumber(r.enhanced_speed),
      elevation: readNumber(r.altitude) ?? readNumber(r.enhanced_altitude),
      temperature: readNumber(r.temperature),
      respirationRate: readNumber(r.respiration_rate) ?? readNumber(r.enhanced_respiration_rate),
      latitude: readNumber(r.position_lat),
      longitude: readNumber(r.position_long),
    }
  })

  const nums = (key: keyof (typeof samples)[number]) =>
    samples.map((s) => s[key]).filter((v): v is number => typeof v === 'number')

  const hrs = nums('heartRate')
  const powers = nums('power')
  const cadences = nums('cadence')
  const speeds = nums('speed')
  const temps = nums('temperature')
  const resps = nums('respirationRate')
  const elevations = nums('elevation')

  const distances = records
    .map((r) => readNumber(r.distance))
    .filter((v): v is number => typeof v === 'number')

  let ascent = 0
  for (let i = 1; i < elevations.length; i++) {
    const delta = elevations[i] - elevations[i - 1]
    if (delta > 0) ascent += delta
  }

  const avgPower = mean(powers)

  return {
    startTime: start.toISOString(),
    title: null,
    activityType: null,
    sportType: null,
    durationSeconds: Math.round((end.getTime() - start.getTime()) / 1000),
    distanceMeters: distances.length ? Math.max(...distances) : null,
    avgSpeed: mean(speeds),
    maxSpeed: speeds.length ? Math.max(...speeds) : null,
    avgHr: mean(hrs),
    maxHr: hrs.length ? Math.max(...hrs) : null,
    avgCadence: mean(cadences),
    maxCadence: cadences.length ? Math.max(...cadences) : null,
    elevationGain: ascent > 0 ? Math.round(ascent) : null,
    avgPower,
    maxPower: powers.length ? Math.max(...powers) : null,
    kilojoules: null,
    hasPowerMeter: avgPower !== null && avgPower > 0,
    avgTemperature: mean(temps),
    maxTemperature: temps.length ? Math.max(...temps) : null,
    trainingEffectAerobic: null,
    trainingEffectAnaerobic: null,
    avgRespirationRate: mean(resps),
    calories: null,
    sweatLossMl: null,
    garminTrainingLoad: null,
    records: samples,
  }
}

export async function parseFitFile(buffer: ArrayBuffer | Buffer): Promise<ParsedFitActivity[]> {
  const data = await runParser(buffer)

  const sessions = Array.isArray(data?.sessions) ? data.sessions : []
  const records = Array.isArray(data?.records) ? data.records : []

  if (sessions.length === 0) {
    const fallback = activityFromRecords(records)
    return fallback ? [fallback] : []
  }

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

    const avgPower = readNumber(session.avg_power) ?? readNumber(session.average_power) ?? null
    const maxPower = readNumber(session.max_power) ?? readNumber(session.maximum_power) ?? null
    const totalCalories = readNumber(session.total_calories) ?? null
    const kilojoules = totalCalories !== null ? Math.round(totalCalories * 4.184) : null
    const hasPowerMeter = avgPower !== null && avgPower > 0
    const avgTemperature = readNumber(session.avg_temperature) ?? readNumber(session.average_temperature) ?? null
    const maxTemperature = readNumber(session.max_temperature) ?? readNumber(session.maximum_temperature) ?? null
    const trainingEffectAerobic = readNumber(session.total_training_effect) ?? null
    const trainingEffectAnaerobic = readNumber(session.total_anaerobic_training_effect) ?? null
    const avgRespirationRate = readNumber(session.avg_respiration_rate) ?? readNumber(session.enhanced_avg_respiration_rate) ?? null
    const sweatLossMl = readNumber(session.est_sweat_loss) ?? null
    const garminTrainingLoad = readNumber(session.training_load_peak) ?? null

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
      avgPower,
      maxPower,
      kilojoules,
      hasPowerMeter,
      avgTemperature,
      maxTemperature,
      trainingEffectAerobic,
      trainingEffectAnaerobic,
      avgRespirationRate,
      calories: totalCalories,
      sweatLossMl,
      garminTrainingLoad,
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

    // FIT `start_time` is already UTC. Running it through zonedTimeToUtc treated
    // it as local wall-clock and shifted every imported ride by the zone offset.
    const durationSeconds = activity.durationSeconds ?? 0
    if (!durationSeconds) return []

    const { trainingLoad, intensityFactor } = estimateTrainingLoad({
      durationSeconds,
      normalizedPower: null,
      averagePower: activity.avgPower,
      averageHr: activity.avgHr,
      ftp,
      maxHr,
      restingHr,
    })

    const garminId = activity.garminActivityId
    const externalId = garminId ? `garmin-${garminId}` : `fit-${startedAt.getTime()}`

    return [
      {
        row: {
          user_id: userId,
          source: (garminId ? 'garmin' : 'manual') as ActivitySource,
          external_id: externalId,
          activity_type: activity.activityType,
          sport_type: activity.sportType,
          title: activity.title,
          start_time: startedAt.toISOString(),
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
          avg_power: activity.avgPower,
          max_power: activity.maxPower,
          has_power_meter: activity.hasPowerMeter,
          kilojoules: activity.kilojoules,
          avg_temperature: activity.avgTemperature,
          max_temperature: activity.maxTemperature,
          training_effect_aerobic: activity.trainingEffectAerobic,
          training_effect_anaerobic: activity.trainingEffectAnaerobic,
          avg_respiration_rate: activity.avgRespirationRate,
          calories: activity.calories,
          sweat_loss_ml: activity.sweatLossMl,
          garmin_training_load: activity.garminTrainingLoad,
          training_load: trainingLoad,
          intensity_factor: intensityFactor,
        },
        externalId,
        records: activity.records,
      },
    ]
  })
}
