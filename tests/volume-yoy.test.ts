import { describe, expect, it } from 'vitest'
import { rollupYearVolume } from '@/lib/training/volume-yoy'

describe('rollupYearVolume', () => {
  it('compares the same months across two years', () => {
    const result = rollupYearVolume({
      year: 2026,
      rides: [
        { date: '2026-03-10', seconds: 2 * 3600 },
        { date: '2026-03-20', seconds: 1 * 3600 },
        { date: '2025-03-08', seconds: 4 * 3600 },
        { date: '2025-07-01', seconds: 5 * 3600 },
      ],
    })

    expect(result.months[2]).toMatchObject({
      label: 'Mar',
      thisYearHours: 3,
      lastYearHours: 4,
    })
    expect(result.thisYearHours).toBe(3)
    expect(result.lastYearHours).toBe(9)
    // Last year-to-date stops at March, the last month with 2026 data.
    expect(result.lastYearToDateHours).toBe(4)
  })
})
