import { describe, expect, it } from 'vitest'
import {
  bandFromHr,
  polarizationVerdict,
  rollupPolarizationWeeks,
  sharesOf,
  zoneSecondsFromSamples,
} from '@/lib/training/polarization'

describe('zoneSecondsFromSamples', () => {
  it('weights by elapsed time, not sample count', () => {
    const zones = zoneSecondsFromSamples({
      maxHr: 180,
      ftp: null,
      samples: [
        { offset_seconds: 0, heart_rate: 100 },
        { offset_seconds: 5, heart_rate: 100 },
        { offset_seconds: 10, heart_rate: 170 },
        { offset_seconds: 15, heart_rate: 170 },
      ],
    })

    expect(zones.hr?.Z1).toBe(10)
    expect(zones.hr?.Z5).toBe(6)
  })

  it('fills power zones when FTP is present', () => {
    const zones = zoneSecondsFromSamples({
      maxHr: null,
      ftp: 250,
      samples: [
        { offset_seconds: 0, power: 140 },
        { offset_seconds: 1, power: 140 },
        { offset_seconds: 2, power: 260 },
      ],
    })

    expect(zones.power?.Z2).toBe(2)
    expect(zones.power?.Z4).toBe(1)
    expect(zones.hr).toBeUndefined()
  })
})

describe('polarizationVerdict', () => {
  it('calls a classic 80/20 week polarized', () => {
    expect(polarizationVerdict({ easy: 0.8, mid: 0.05, hard: 0.15 })).toBe('polarized')
  })

  it('flags a Z3-heavy week as threshold stew', () => {
    expect(polarizationVerdict({ easy: 0.55, mid: 0.35, hard: 0.1 })).toBe('threshold')
  })

  it('flags a week that is almost all easy', () => {
    expect(polarizationVerdict({ easy: 0.92, mid: 0.05, hard: 0.03 })).toBe('too-easy')
  })
})

describe('rollupPolarizationWeeks', () => {
  it('sums rides into ISO weeks and prefers power when asked', () => {
    const weeks = rollupPolarizationWeeks(
      [
        {
          date: '2026-09-14',
          zones: {
            hr: { Z1: 1000, Z2: 2000, Z3: 0, Z4: 0, Z5: 0 },
            power: { Z1: 500, Z2: 500, Z3: 0, Z4: 200, Z5: 0 },
          },
        },
        {
          date: '2026-09-16',
          zones: { hr: { Z1: 0, Z2: 0, Z3: 0, Z4: 600, Z5: 0 } },
        },
      ],
      true
    )

    expect(weeks).toHaveLength(1)
    expect(weeks[0].weekStart).toBe('2026-09-14')
    expect(weeks[0].metric).toBe('power')
    expect(weeks[0].band.easy).toBe(1000)
    expect(weeks[0].band.hard).toBe(200)
  })

  it('falls back to heart rate when the week has no power', () => {
    const weeks = rollupPolarizationWeeks(
      [
        {
          date: '2026-09-14',
          zones: { hr: { Z1: 3000, Z2: 1000, Z3: 200, Z4: 800, Z5: 0 } },
        },
      ],
      true
    )

    expect(weeks[0].metric).toBe('hr')
    expect(sharesOf(weeks[0].band)?.easy).toBeCloseTo(4000 / 5000)
  })
})

describe('bandFromHr', () => {
  it('puts Z1–Z2 in easy and Z4–Z5 in hard', () => {
    expect(bandFromHr({ Z1: 10, Z2: 20, Z3: 5, Z4: 3, Z5: 2 })).toEqual({
      easy: 30,
      mid: 5,
      hard: 5,
    })
  })
})
