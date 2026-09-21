/**
 * Dual-sided pedal trend: balance around 50/50, plus torque effectiveness
 * and smoothness when the meter sends them.
 *
 * Pure functions only.
 */
import type { PedalMetrics } from '@/lib/garmin/pedal-metrics'

export type PedalRide = {
  date: string
  title: string | null
  metrics: PedalMetrics
}

export type PedalPoint = {
  date: string
  title: string | null
  leftPct: number | null
  te: number | null
  smooth: number | null
}

export type PedalTrend = {
  points: PedalPoint[]
  meanLeft: number | null
  /** Mean |left − 50|. Under ~3 is noise. */
  meanAbsDelta: number | null
}

export function buildPedalTrend(rides: PedalRide[]): PedalTrend {
  const points = rides
    .map((ride) => ({
      date: ride.date,
      title: ride.title,
      leftPct: ride.metrics.leftPct,
      te: meanOf(ride.metrics.leftTe, ride.metrics.rightTe),
      smooth: meanOf(ride.metrics.leftSmooth, ride.metrics.rightSmooth),
    }))
    .filter((point) => point.leftPct != null || point.te != null || point.smooth != null)

  const withBalance = points.filter((p) => p.leftPct != null) as Array<PedalPoint & { leftPct: number }>
  const meanLeft =
    withBalance.length > 0
      ? withBalance.reduce((sum, p) => sum + p.leftPct, 0) / withBalance.length
      : null
  const meanAbsDelta =
    withBalance.length > 0
      ? withBalance.reduce((sum, p) => sum + Math.abs(p.leftPct - 50), 0) / withBalance.length
      : null

  return { points, meanLeft, meanAbsDelta }
}

function meanOf(a: number | null, b: number | null): number | null {
  if (a != null && b != null) return (a + b) / 2
  return a ?? b
}
