import { describe, expect, it } from 'vitest'
import { buildRecoverySeries, hasMorningCheckIn } from '@/lib/training/recovery-series'

describe('recovery series', () => {
  it('fills every day and prefers the manual sleep row', () => {
    const { series, todayPoint, loggedToday } = buildRecoverySeries({
      today: '2026-09-13',
      days: 3,
      sleep: [
        { date: '2026-09-13', source: 'garmin', duration_minutes: 300, sleep_score: 50 },
        { date: '2026-09-13', source: 'manual', duration_minutes: 450, sleep_score: 80 },
        { date: '2026-09-11', source: 'garmin', duration_minutes: 420, sleep_score: 70 },
      ],
      recovery: [{ date: '2026-09-12', source: 'manual', soreness: 3 }],
    })

    expect(series.map((d) => d.date)).toEqual(['2026-09-11', '2026-09-12', '2026-09-13'])
    expect(todayPoint.sleepHours).toBe(7.5)
    expect(todayPoint.sleepScore).toBe(80)
    expect(loggedToday).toBe(true)
    expect(series[0].sleepHours).toBe(7)
    expect(series[1].soreness).toBe(3)
    expect(series[1].sleepHours).toBeNull()
  })

  it('treats an empty today as not logged', () => {
    const { todayPoint, loggedToday } = buildRecoverySeries({
      today: '2026-09-13',
      days: 2,
      sleep: [{ date: '2026-09-12', source: 'manual', duration_minutes: 480, sleep_score: 75 }],
      recovery: [],
    })

    expect(loggedToday).toBe(false)
    expect(hasMorningCheckIn(todayPoint)).toBe(false)
  })
})
