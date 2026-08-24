import { createAdminClient } from '@/lib/supabase/admin'
import { CURVE_DURATIONS } from './power-curve'
import type { PowerCurve } from '@/lib/types/database'

import 'server-only'

const WINDOW_DAYS = 90

/**
 * Standard field-test conversions. Longer efforts need less correction because
 * they sit closer to an actual hour at threshold.
 */
const FTP_FACTORS: Array<{ duration: number; factor: number; label: string }> = [
  { duration: 3600, factor: 1.0, label: '60 min' },
  { duration: 1200, factor: 0.95, label: '20 min' },
  { duration: 480, factor: 0.9, label: '8 min' },
]

export type CurvePoint = {
  duration: number
  watts: number
  activityId: string
  date: string
  title: string | null
  fromPowerMeter: boolean
}

export type FtpEstimate = {
  ftp: number
  basisDuration: number
  basisLabel: string
  basisWatts: number
  factor: number
  activityId: string
  date: string
  title: string | null
  fromPowerMeter: boolean
}

export type PowerSummary = {
  windowDays: number
  curve: CurvePoint[]
  estimate: FtpEstimate | null
  ridesWithPower: number
}

/** Best watts per duration over the window, with the ride each best came from. */
export async function loadPowerSummary(
  userId: string,
  windowDays = WINDOW_DAYS
): Promise<PowerSummary> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

  const { data: activities } = await createAdminClient()
    .from('activities')
    .select('id, title, start_time, power_curve, has_power_meter')
    .eq('user_id', userId)
    .not('power_curve', 'is', null)
    .gte('start_time', since)
    .order('start_time', { ascending: false })

  const best = new Map<number, CurvePoint>()

  for (const activity of activities ?? []) {
    const curve = activity.power_curve as PowerCurve | null
    if (!curve) continue

    for (const duration of CURVE_DURATIONS) {
      const watts = curve[String(duration)]
      if (typeof watts !== 'number' || watts <= 0) continue

      const current = best.get(duration)
      if (!current || watts > current.watts) {
        best.set(duration, {
          duration,
          watts,
          activityId: activity.id,
          date: activity.start_time.slice(0, 10),
          title: activity.title,
          fromPowerMeter: activity.has_power_meter,
        })
      }
    }
  }

  const curve = Array.from(best.values()).sort((a, b) => a.duration - b.duration)

  return {
    windowDays,
    curve,
    estimate: estimateFromCurve(best),
    ridesWithPower: activities?.length ?? 0,
  }
}

function estimateFromCurve(best: Map<number, CurvePoint>): FtpEstimate | null {
  let winner: FtpEstimate | null = null

  for (const { duration, factor, label } of FTP_FACTORS) {
    const point = best.get(duration)
    if (!point) continue

    const ftp = Math.round(point.watts * factor)
    // A hard 20-minute effort can beat a soft full hour, so keep the highest.
    if (!winner || ftp > winner.ftp) {
      winner = {
        ftp,
        basisDuration: duration,
        basisLabel: label,
        basisWatts: point.watts,
        factor,
        activityId: point.activityId,
        date: point.date,
        title: point.title,
        fromPowerMeter: point.fromPowerMeter,
      }
    }
  }

  return winner
}

export async function applyEstimatedFtp(userId: string, ftp: number): Promise<void> {
  const { error } = await createAdminClient().from('athlete_metrics').upsert(
    {
      user_id: userId,
      ftp,
      ftp_source: 'estimated',
      ftp_updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) throw new Error(error.message)
}
