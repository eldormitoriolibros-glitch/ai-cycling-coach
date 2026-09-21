import { describe, expect, it } from 'vitest'
import {
  buildSleepArchitecture,
  meanRestorativeShare,
  nightFromSleep,
} from '@/lib/training/sleep-architecture'

describe('nightFromSleep', () => {
  it('fills light as whatever is left after deep, REM and awake', () => {
    const night = nightFromSleep({
      date: '2026-09-13',
      duration_minutes: 480,
      sleep_score: 80,
      deep_sleep_minutes: 90,
      rem_sleep_minutes: 96,
      awake_minutes: 24,
    })

    expect(night).toEqual({
      date: '2026-09-13',
      deepHours: 1.5,
      remHours: 1.6,
      lightHours: 4.5,
      awakeHours: 0.4,
      restorativeShare: (1.5 + 1.6) / (1.5 + 1.6 + 4.5),
    })
  })

  it('stays quiet when the row has hours but no stages', () => {
    expect(
      nightFromSleep({
        date: '2026-09-13',
        duration_minutes: 420,
        sleep_score: 70,
      })
    ).toBeNull()
  })
})

describe('buildSleepArchitecture', () => {
  it('keeps Garmin stages when a manual check-in only logged hours', () => {
    const nights = buildSleepArchitecture({
      today: '2026-09-13',
      days: 2,
      sleep: [
        {
          date: '2026-09-13',
          source: 'garmin',
          duration_minutes: 400,
          sleep_score: 60,
          deep_sleep_minutes: 80,
          rem_sleep_minutes: 90,
          awake_minutes: 20,
        },
        {
          date: '2026-09-13',
          source: 'manual',
          duration_minutes: 450,
          sleep_score: 80,
        },
      ],
    })

    expect(nights).toHaveLength(1)
    expect(nights[0].deepHours).toBeCloseTo(80 / 60)
    expect(nights[0].lightHours).toBeCloseTo((450 - 80 - 90 - 20) / 60)
  })
})

describe('meanRestorativeShare', () => {
  it('averages the last nights that have a share', () => {
    const nights = [
      { date: 'a', deepHours: 1, remHours: 1, lightHours: 2, awakeHours: 0, restorativeShare: 0.5 },
      { date: 'b', deepHours: 1, remHours: 1, lightHours: 6, awakeHours: 0, restorativeShare: 0.25 },
    ]
    expect(meanRestorativeShare(nights, 7)).toBeCloseTo(0.375)
  })
})
