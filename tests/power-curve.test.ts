import { describe, expect, it } from 'vitest'
import {
  computeNormalizedPower,
  derivePowerMetrics,
  wattsFromOffsets,
} from '@/lib/training/power-curve'

describe('wattsFromOffsets', () => {
  it('builds a dense stream so Garmin samples can feed the same curve as Strava', () => {
    const watts = wattsFromOffsets([
      { offsetSeconds: 0, power: 200 },
      { offsetSeconds: 2, power: 220 },
    ])
    expect(watts).toEqual([200, null, 220])
  })
})

describe('derivePowerMetrics', () => {
  it('computes NP and a 5s best from a steady Garmin stream', () => {
    const watts = Array.from({ length: 60 }, () => 200)
    const derived = derivePowerMetrics(watts)
    expect(derived.maxPower).toBe(200)
    expect(derived.normalizedPower).toBe(computeNormalizedPower(watts))
    expect(derived.curve?.['5']).toBe(200)
  })
})
