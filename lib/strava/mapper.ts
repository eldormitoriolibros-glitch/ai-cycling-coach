import { estimateTrainingLoad } from '@/lib/training/load'
import type { Database } from '@/lib/types/database'
import type { StravaActivity } from './types'

type ActivityInsert = Database['public']['Tables']['activities']['Insert']

export type AthleteThresholds = {
  ftp: number | null
  maxHr: number | null
  restingHr: number | null
}

export function mapStravaActivity(
  userId: string,
  activity: StravaActivity,
  thresholds: AthleteThresholds
): ActivityInsert {
  const durationSeconds = activity.elapsed_time ?? null
  const movingSeconds = activity.moving_time ?? null

  const { trainingLoad, intensityFactor } = estimateTrainingLoad({
    // Moving time reflects actual work better than elapsed time.
    durationSeconds: movingSeconds ?? durationSeconds,
    normalizedPower: activity.weighted_average_watts,
    // Estimated power (device_watts false) still beats having no signal at all.
    averagePower: activity.average_watts,
    averageHr: activity.average_heartrate,
    ftp: thresholds.ftp,
    maxHr: thresholds.maxHr,
    restingHr: thresholds.restingHr,
  })

  return {
    user_id: userId,
    source: 'strava',
    external_id: String(activity.id),
    activity_type: activity.type ?? null,
    sport_type: activity.sport_type ?? activity.type ?? null,
    title: activity.name ?? null,
    description: activity.description ?? null,
    start_time: new Date(activity.start_date).toISOString(),
    timezone: activity.timezone ?? null,
    duration_seconds: durationSeconds,
    moving_seconds: movingSeconds,
    distance_meters: activity.distance ?? null,
    elevation_gain_meters: activity.total_elevation_gain ?? null,
    avg_power: activity.average_watts ?? null,
    // normalized_power and max_power are owned by the stream backfill: Strava's
    // list endpoint never returns them, so writing them here would wipe ours.
    kilojoules: activity.kilojoules ?? null,
    has_power_meter: activity.device_watts ?? false,
    avg_hr: round(activity.average_heartrate),
    max_hr: round(activity.max_heartrate),
    avg_cadence: round(activity.average_cadence),
    avg_speed: activity.average_speed ?? null,
    max_speed: activity.max_speed ?? null,
    training_load: trainingLoad,
    intensity_factor: intensityFactor,
    is_trainer: activity.trainer ?? false,
  }
}

function round(value: number | null | undefined): number | null {
  return typeof value === 'number' ? Math.round(value) : null
}
