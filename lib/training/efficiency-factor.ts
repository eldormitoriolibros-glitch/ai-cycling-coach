/**
 * Efficiency factor: watts per heartbeat. Same ride, more watts at the same
 * pulse (or the same watts at a lower pulse) means the aerobic engine improved.
 *
 * FTP is not required for the ratio. It only helps decide which rides were
 * steady enough to compare — a VO2 session always looks "efficient" and would
 * pollute the trend.
 *
 * Pure functions only.
 */

export type EfficiencyRide = {
  id: string
  date: string
  title: string | null
  seconds: number
  normalizedPower: number | null
  averagePower: number | null
  averageHr: number | null
  intensityFactor: number | null
}

export type EfficiencyPoint = {
  id: string
  date: string
  title: string | null
  ef: number
  power: number
  hr: number
  seconds: number
  /** False when the ride was too intense to count in the trend. */
  aerobic: boolean
}

export type EfficiencyTrend = {
  points: EfficiencyPoint[]
  recentMean: number | null
  previousMean: number | null
}

const MIN_SECONDS = 40 * 60
const MIN_HR = 90
const MIN_POWER = 60
/** Above this, EF is a different animal (threshold / VO2). */
const AEROBIC_IF = 0.85

export function efficiencyFactor(power: number, hr: number): number | null {
  if (power < MIN_POWER || hr < MIN_HR) return null
  return Math.round((power / hr) * 1000) / 1000
}

export function rideEfficiency(ride: EfficiencyRide): EfficiencyPoint | null {
  const power = ride.normalizedPower ?? ride.averagePower
  const hr = ride.averageHr
  if (power == null || hr == null) return null
  if ((ride.seconds ?? 0) < MIN_SECONDS) return null

  const ef = efficiencyFactor(power, hr)
  if (ef == null) return null

  const aerobic =
    ride.intensityFactor != null ? ride.intensityFactor <= AEROBIC_IF : true

  return {
    id: ride.id,
    date: ride.date,
    title: ride.title,
    ef,
    power: Math.round(power),
    hr: Math.round(hr),
    seconds: ride.seconds,
    aerobic,
  }
}

export function buildEfficiencyTrend(rides: EfficiencyRide[]): EfficiencyTrend {
  const points = rides
    .map(rideEfficiency)
    .filter((point): point is EfficiencyPoint => point != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const aerobic = points.filter((p) => p.aerobic)
  const recent = aerobic.slice(-6)
  const previous = aerobic.slice(-12, -6)

  return {
    points,
    recentMean: meanEf(recent),
    previousMean: meanEf(previous),
  }
}

function meanEf(points: EfficiencyPoint[]): number | null {
  if (points.length < 3) return null
  const sum = points.reduce((acc, p) => acc + p.ef, 0)
  return Math.round((sum / points.length) * 1000) / 1000
}
