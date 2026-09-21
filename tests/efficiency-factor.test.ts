import { describe, expect, it } from 'vitest'
import { buildEfficiencyTrend, efficiencyFactor, rideEfficiency } from '@/lib/training/efficiency-factor'

describe('efficiencyFactor', () => {
  it('is watts divided by heart rate', () => {
    expect(efficiencyFactor(180, 140)).toBe(1.286)
  })

  it('stays quiet on junk numbers', () => {
    expect(efficiencyFactor(40, 140)).toBeNull()
    expect(efficiencyFactor(180, 70)).toBeNull()
  })
})

describe('rideEfficiency', () => {
  it('prefers normalized power and marks a hard IF as not aerobic', () => {
    const point = rideEfficiency({
      id: '1',
      date: '2026-09-01',
      title: 'VO2',
      seconds: 50 * 60,
      normalizedPower: 240,
      averagePower: 200,
      averageHr: 160,
      intensityFactor: 0.95,
    })

    expect(point?.ef).toBe(1.5)
    expect(point?.aerobic).toBe(false)
  })

  it('drops rides that are too short', () => {
    expect(
      rideEfficiency({
        id: '1',
        date: '2026-09-01',
        title: null,
        seconds: 20 * 60,
        normalizedPower: 180,
        averagePower: 180,
        averageHr: 130,
        intensityFactor: 0.7,
      })
    ).toBeNull()
  })
})

describe('buildEfficiencyTrend', () => {
  it('compares the last six aerobic rides to the six before', () => {
    const rides = Array.from({ length: 14 }, (_, i) => ({
      id: String(i),
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      title: null,
      seconds: 60 * 60,
      normalizedPower: i < 8 ? 160 : 180,
      averagePower: null,
      averageHr: 140,
      intensityFactor: 0.7,
    }))

    const trend = buildEfficiencyTrend(rides)
    expect(trend.previousMean).toBeCloseTo(160 / 140, 2)
    expect(trend.recentMean).toBeCloseTo(180 / 140, 2)
    expect(trend.points).toHaveLength(14)
  })
})
