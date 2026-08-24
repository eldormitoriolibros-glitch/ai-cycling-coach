import { createAdminClient } from '@/lib/supabase/admin'
import { eachDay, localDateKey } from './dates'
import { estimateTrainingLoad } from './load'

import 'server-only'

/** Exponentially-weighted time constants, in days. */
const CHRONIC_DAYS = 42
const ACUTE_DAYS = 7
const RAMP_WINDOW_DAYS = 7

export type DailyLoadPoint = {
  date: string
  daily_load: number
  chronic_load: number
  acute_load: number
  form: number
  ramp_rate: number | null
}

/**
 * Impulse-response model: chronic load (fitness) and acute load (fatigue) are
 * exponentially-weighted averages of daily training stress; form is yesterday's
 * fitness minus yesterday's fatigue.
 */
export function buildSeries(dailyTotals: Map<string, number>, today: string): DailyLoadPoint[] {
  const dates = Array.from(dailyTotals.keys()).sort()
  if (dates.length === 0) return []

  const series: DailyLoadPoint[] = []
  let chronic = 0
  let acute = 0

  for (const date of eachDay(dates[0], today)) {
    const load = dailyTotals.get(date) ?? 0
    const form = chronic - acute

    chronic += (load - chronic) / CHRONIC_DAYS
    acute += (load - acute) / ACUTE_DAYS

    const weekAgo = series[series.length - RAMP_WINDOW_DAYS]

    series.push({
      date,
      daily_load: round(load),
      chronic_load: round(chronic),
      acute_load: round(acute),
      form: round(form),
      ramp_rate: weekAgo ? round(chronic - weekAgo.chronic_load) : null,
    })
  }

  return series
}

/**
 * Re-derives per-activity training stress from stored power/HR columns.
 * Needed whenever FTP or heart rates change — no Strava calls involved.
 */
export async function recomputeActivityLoads(userId: string): Promise<number> {
  const supabase = createAdminClient()

  const [{ data: metrics }, { data: activities }] = await Promise.all([
    supabase.from('athlete_metrics').select('ftp, max_hr, resting_hr').eq('user_id', userId).maybeSingle(),
    supabase
      .from('activities')
      .select(
        'id, moving_seconds, duration_seconds, normalized_power, avg_power, has_power_meter, avg_hr, training_load'
      )
      .eq('user_id', userId),
  ])

  if (!activities?.length) return 0

  const updates = activities.flatMap((activity) => {
    const { trainingLoad, intensityFactor } = estimateTrainingLoad({
      durationSeconds: activity.moving_seconds ?? activity.duration_seconds,
      normalizedPower: activity.normalized_power,
      averagePower: activity.avg_power,
      averageHr: activity.avg_hr,
      ftp: metrics?.ftp ?? null,
      maxHr: metrics?.max_hr ?? null,
      restingHr: metrics?.resting_hr ?? null,
    })

    if (trainingLoad === activity.training_load) return []
    return [{ id: activity.id, trainingLoad, intensityFactor }]
  })

  await Promise.all(
    updates.map(({ id, trainingLoad, intensityFactor }) =>
      supabase
        .from('activities')
        .update({ training_load: trainingLoad, intensity_factor: intensityFactor })
        .eq('id', id)
    )
  )

  return updates.length
}

/** Rebuilds the whole `training_load` series for a user from their activities. */
export async function recomputeTrainingLoad(userId: string): Promise<DailyLoadPoint[]> {
  const supabase = createAdminClient()

  const [{ data: profile }, { data: activities }] = await Promise.all([
    supabase.from('users').select('timezone').eq('id', userId).maybeSingle(),
    supabase
      .from('activities')
      .select('start_time, training_load')
      .eq('user_id', userId)
      .order('start_time', { ascending: true }),
  ])

  if (!activities?.length) return []

  const timeZone = profile?.timezone || 'UTC'

  const dailyTotals = new Map<string, number>()
  for (const activity of activities) {
    const key = localDateKey(activity.start_time, timeZone)
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + (activity.training_load ?? 0))
  }

  const today = localDateKey(new Date().toISOString(), timeZone)
  const series = buildSeries(dailyTotals, today)
  if (series.length === 0) return []

  const { error } = await supabase
    .from('training_load')
    .upsert(
      series.map((point) => ({ user_id: userId, ...point })),
      { onConflict: 'user_id,date' }
    )

  if (error) throw new Error(`No se pudo guardar la carga de entrenamiento: ${error.message}`)

  return series
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
