import { describe, expect, it } from 'vitest'
import { buildPedalTrend } from '@/lib/training/pedal-trend'
import { EMPTY_PEDAL_METRICS } from '@/lib/garmin/pedal-metrics'

describe('buildPedalTrend', () => {
  it('averages left/right TE and smoothness and reports the mean lean', () => {
    const trend = buildPedalTrend([
      {
        date: '2026-09-01',
        title: 'A',
        metrics: { ...EMPTY_PEDAL_METRICS, leftPct: 47, leftTe: 70, rightTe: 80, leftSmooth: 20, rightSmooth: 22 },
      },
      {
        date: '2026-09-08',
        title: 'B',
        metrics: { ...EMPTY_PEDAL_METRICS, leftPct: 49 },
      },
    ])

    expect(trend.points[0].te).toBe(75)
    expect(trend.points[0].smooth).toBe(21)
    expect(trend.meanLeft).toBe(48)
    expect(trend.meanAbsDelta).toBe(2)
  })

  it('drops rides with no pedal numbers', () => {
    const trend = buildPedalTrend([
      { date: '2026-09-01', title: null, metrics: EMPTY_PEDAL_METRICS },
    ])
    expect(trend.points).toHaveLength(0)
    expect(trend.meanLeft).toBeNull()
  })
})
