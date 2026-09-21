import { describe, expect, it } from 'vitest'
import {
  bestPlanOffset,
  comparePlan,
  comparisonMetric,
  hasMeasurableWork,
  plannedBlocks,
  plannedPrescription,
  plannedSegments,
  shiftSegments,
  type RidePoint,
} from '@/lib/training/planned-vs-done'
import { powerTargetFor, zonesInText } from '@/lib/training/zones'

const THRESHOLD_SESSION = {
  title: '3x10m Z4',
  workout_type: 'threshold',
  description:
    '15 min de entrada, 3 bloques de 10 min al FTP con 5 min suaves entre cada uno, 10 min de vuelta a la calma.',
  duration_minutes: 70,
  target_zone: 'Z4',
  target_power: null,
}

/** Constant-watt ride, one sample per second. */
function steadyRide(seconds: number, watts: number): RidePoint[] {
  return Array.from({ length: seconds }, (_, i) => ({ seconds: i, power: watts, hr: null }))
}

describe('zonesInText', () => {
  it('reads ranges and named intensities', () => {
    expect(zonesInText('Z1–Z2')).toEqual(['Z1', 'Z2'])
    expect(zonesInText('FTP / Z4')).toEqual(['Z4'])
    expect(zonesInText('sweet spot')).toEqual(['Z4'])
    expect(zonesInText('')).toEqual([])
  })
})

describe('powerTargetFor', () => {
  it('spans the whole range when the prescription names two zones', () => {
    expect(powerTargetFor('Z1–Z2', 250)).toEqual({ low: 0, high: 188 })
    expect(powerTargetFor('Z4', 250)).toEqual({ low: 225, high: 263 })
  })

  it('leaves the top zone open-ended and needs a reference', () => {
    expect(powerTargetFor('Z6', 250)).toEqual({ low: 300, high: null })
    expect(powerTargetFor('Z4', null)).toBeNull()
  })
})

describe('plannedSegments', () => {
  it('unrolls intervals into one segment per repeat with recoveries between', () => {
    const segments = plannedSegments({
      blocks: plannedBlocks(THRESHOLD_SESSION),
      metric: 'power',
      ftp: 250,
      maxHr: null,
    })

    expect(segments.map((s) => s.label)).toEqual([
      'Entrada en calor',
      'Serie 1/3',
      'Recuperación',
      'Serie 2/3',
      'Recuperación',
      'Serie 3/3',
      'Vuelta a la calma',
    ])
    // 15 + 3x10 + 2x5 + 10 minutes, laid end to end.
    expect(segments[segments.length - 1].endSeconds).toBe(65 * 60)
    expect(segments[1]).toMatchObject({ role: 'work', low: 225, high: 263 })
  })

  it('prefers an explicit watt target over the zone it was rounded into', () => {
    const segments = plannedSegments({
      blocks: plannedBlocks(THRESHOLD_SESSION),
      metric: 'power',
      ftp: 250,
      maxHr: null,
      targetPower: 240,
    })
    expect(segments[1]).toMatchObject({ low: 230, high: 250 })
  })

  it('falls back to the session zone when the intervals name no intensity', () => {
    // The coach left the intensity implied by the session, which is the common
    // case and used to leave the key work without a target band.
    const session = {
      title: 'Bloques de umbral',
      workout_type: 'threshold',
      description:
        '15 min de entrada, 3 bloques de 10 min con 5 min suaves entre cada uno, 30 min de vuelta a la calma.',
      duration_minutes: 85,
      target_zone: null,
      target_power: null,
    }
    const { blocks, zone } = plannedPrescription(session)
    expect(blocks.find((b) => b.label === 'Intervalos')?.intensity).toBeNull()
    expect(zone).toBe('Z4')

    const segments = plannedSegments({ blocks, metric: 'hr', ftp: null, maxHr: 189, fallbackZone: zone })
    expect(segments.filter((s) => s.role === 'work')).toHaveLength(3)
    expect(segments.find((s) => s.role === 'work')).toMatchObject({ low: 151, high: 170 })
  })

  it('leaves recoveries on their own easy zone, not the session zone', () => {
    const segments = plannedSegments({
      blocks: plannedBlocks(THRESHOLD_SESSION),
      metric: 'power',
      ftp: 250,
      maxHr: null,
      fallbackZone: 'Z4',
    })
    expect(segments.find((s) => s.role === 'recovery')).toMatchObject({ zone: 'Z1–Z2' })
  })

  it('sizes an open-ended main block from the ride instead of dropping it', () => {
    // No duration on the session: the main block comes back with null minutes,
    // which used to vanish and leave a plan of just warmup + cooldown.
    const session = {
      title: 'Fondo',
      workout_type: 'endurance',
      description: null,
      duration_minutes: null,
      target_zone: 'Z2',
      target_power: null,
    }
    const { blocks, zone } = plannedPrescription(session)
    expect(blocks.find((b) => b.label === 'Bloque principal')?.minutes).toBeNull()

    const segments = plannedSegments({
      blocks,
      metric: 'hr',
      ftp: null,
      maxHr: 189,
      fallbackZone: zone,
      rideSeconds: 80 * 60,
    })
    const main = segments.find((s) => s.role === 'steady')
    expect(main).toMatchObject({ inferredLength: true, low: 113, high: 132 })
    // 10 min warmup + 62 min main + 8 min cooldown fills the 80 min ride.
    expect((main!.endSeconds - main!.startSeconds) / 60).toBe(62)
    expect(segments[segments.length - 1].endSeconds).toBe(80 * 60)

    const comparison = comparePlan({
      segments,
      points: Array.from({ length: 80 * 60 }, (_, i) => ({ seconds: i, power: null, hr: 120 })),
      metric: 'hr',
    })
    expect(comparison.plannedSecondsKnown).toBe(false)
    expect(comparison.adherence).toBe(100)
  })

  it('leaves the plan unmeasurable when nothing but warmup and cooldown survives', () => {
    const segments = plannedSegments({
      blocks: [
        { label: 'Entrada en calor', minutes: 15, repeats: null, intensity: 'Z1–Z2' },
        { label: 'Bloque principal', minutes: null, repeats: null, intensity: 'Z2' },
        { label: 'Vuelta a la calma', minutes: 10, repeats: null, intensity: 'Z1' },
      ],
      metric: 'hr',
      ftp: null,
      maxHr: 189,
      rideSeconds: null,
    })
    expect(hasMeasurableWork(segments)).toBe(false)
  })

  it('skips strength sessions, which have nothing to overlay', () => {
    expect(
      plannedBlocks({
        title: 'Fuerza en casa',
        workout_type: 'strength',
        description: 'Circuito de sentadillas y plancha 3x12',
        duration_minutes: 40,
        target_zone: null,
      })
    ).toEqual([])
  })
})

describe('comparePlan', () => {
  const segments = plannedSegments({
    blocks: plannedBlocks(THRESHOLD_SESSION),
    metric: 'power',
    ftp: 250,
    maxHr: null,
  })

  it('scores a ride held inside the prescribed band', () => {
    const result = comparePlan({ segments, points: steadyRide(65 * 60, 240), metric: 'power' })
    // 240 W sits in Z4 (225–263) but above the Z1–Z2 warmup band.
    expect(result.adherence).toBe(100)
    expect(result.results.filter((r) => r.segment.role === 'work')).toHaveLength(3)
    expect(result.results[1]).toMatchObject({ actual: 240, verdict: 'in' })
  })

  it('flags intervals ridden under target', () => {
    const result = comparePlan({ segments, points: steadyRide(65 * 60, 190), metric: 'power' })
    expect(result.adherence).toBe(0)
    expect(result.results[1].verdict).toBe('below')
  })

  it('reports no data for blocks the ride never reached', () => {
    const short = comparePlan({ segments, points: steadyRide(20 * 60, 240), metric: 'power' })
    expect(short.actualSeconds).toBe(20 * 60 - 1)
    expect(short.plannedSeconds).toBe(65 * 60)
    expect(short.results[short.results.length - 1]).toMatchObject({ actual: null, verdict: 'na' })
  })

  it('ignores recoveries when judging adherence', () => {
    const points = steadyRide(65 * 60, 240).map((point) => {
      const inRecovery = segments.some(
        (s) => s.role === 'recovery' && point.seconds >= s.startSeconds && point.seconds < s.endSeconds
      )
      return inRecovery ? { ...point, power: 40 } : point
    })
    expect(comparePlan({ segments, points, metric: 'power' }).adherence).toBe(100)
  })
})

describe('bestPlanOffset', () => {
  const segments = plannedSegments({
    blocks: plannedBlocks(THRESHOLD_SESSION),
    metric: 'power',
    ftp: 250,
    maxHr: null,
  })

  /** A ride that loafs for `leadIn` minutes, then rides the plan properly. */
  function rideStartingAt(leadInMinutes: number, tailMinutes = 0): RidePoint[] {
    const lead = leadInMinutes * 60
    const planSeconds = segments[segments.length - 1].endSeconds
    const total = lead + planSeconds + tailMinutes * 60
    return Array.from({ length: total }, (_, i) => {
      const onPlan = segments.find(
        (s) => i - lead >= s.startSeconds && i - lead < s.endSeconds
      )
      const watts = !onPlan || onPlan.role === 'recovery' || onPlan.role === 'warmup' ? 120 : 240
      return { seconds: i, power: i < lead ? 120 : watts, hr: null }
    })
  }

  it('slides the plan onto the part of the ride where the session happened', () => {
    const points = rideStartingAt(12, 5)
    expect(bestPlanOffset({ segments, points, metric: 'power' })).toBe(12 * 60)
  })

  it('leaves the plan at the start when the session began with the ride', () => {
    const points = rideStartingAt(0, 20)
    expect(bestPlanOffset({ segments, points, metric: 'power' })).toBe(0)
  })

  it('does not slide when the ride has no room for it', () => {
    const points = rideStartingAt(0)
    expect(bestPlanOffset({ segments, points, metric: 'power' })).toBe(0)
  })

  it('reports the anchor and keeps the plan duration after shifting', () => {
    const points = rideStartingAt(12, 5)
    const offset = bestPlanOffset({ segments, points, metric: 'power' })
    const comparison = comparePlan({
      segments: shiftSegments(segments, offset),
      points,
      metric: 'power',
    })

    expect(comparison.offsetSeconds).toBe(12 * 60)
    expect(comparison.plannedSeconds).toBe(65 * 60)
    expect(comparison.adherence).toBe(100)
  })
})

describe('comparisonMetric', () => {
  it('uses watts when they can be priced, pulse as the fallback', () => {
    const withPower: RidePoint[] = [{ seconds: 0, power: 200, hr: 150 }]
    const hrOnly: RidePoint[] = [{ seconds: 0, power: null, hr: 150 }]

    expect(comparisonMetric({ points: withPower, ftp: 250, maxHr: 190 })).toBe('power')
    expect(comparisonMetric({ points: withPower, ftp: null, maxHr: 190 })).toBe('hr')
    expect(comparisonMetric({ points: hrOnly, ftp: 250, maxHr: 190 })).toBe('hr')
    expect(comparisonMetric({ points: hrOnly, ftp: 250, maxHr: null })).toBeNull()
  })
})
