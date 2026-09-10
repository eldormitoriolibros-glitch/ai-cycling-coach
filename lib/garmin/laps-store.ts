import { createAdminClient } from '@/lib/supabase/admin'
import type { FitLap } from './fit'

import 'server-only'

/**
 * Replaces the stored splits for an activity. A file with a single lap is just
 * the whole ride, so it carries no interval information and is skipped.
 */
export async function saveActivityLaps(
  userId: string,
  activityId: string,
  laps: FitLap[]
): Promise<number> {
  if (laps.length < 2) return 0

  const supabase = createAdminClient()
  const rows = laps.map((lap) => ({
    user_id: userId,
    activity_id: activityId,
    lap_index: lap.lapIndex,
    start_offset_seconds: lap.startOffsetSeconds,
    elapsed_seconds: lap.elapsedSeconds,
    moving_seconds: lap.movingSeconds,
    distance_meters: lap.distanceMeters,
    avg_speed: lap.avgSpeed,
    max_speed: lap.maxSpeed,
    avg_hr: lap.avgHr == null ? null : Math.round(lap.avgHr),
    max_hr: lap.maxHr == null ? null : Math.round(lap.maxHr),
    avg_cadence: lap.avgCadence == null ? null : Math.round(lap.avgCadence),
    max_cadence: lap.maxCadence == null ? null : Math.round(lap.maxCadence),
    avg_power: lap.avgPower,
    max_power: lap.maxPower,
    normalized_power: lap.normalizedPower,
    elevation_gain_meters: lap.elevationGain,
    elevation_loss_meters: lap.elevationLoss,
    calories: lap.calories,
    avg_temperature: lap.avgTemperature,
    lap_trigger: lap.lapTrigger,
    intensity: lap.intensity,
  }))

  await supabase.from('activity_laps').delete().eq('activity_id', activityId)
  const { error } = await supabase.from('activity_laps').insert(rows as any)
  if (error) return 0
  return rows.length
}
