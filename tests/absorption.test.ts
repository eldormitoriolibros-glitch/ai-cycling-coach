import { describe, expect, it } from 'vitest'
import { buildAbsorption, pickRecoverySignal } from '@/lib/training/absorption'
import type { RecoveryDayPoint } from '@/lib/training/recovery-series'

function day(date: string, extras: Partial<RecoveryDayPoint> = {}): RecoveryDayPoint {
  return {
    date,
    sleepHours: null,
    sleepScore: null,
    restingHr: null,
    hrv: null,
    soreness: null,
    motivation: null,
    bodyBattery: null,
    ...extras,
  }
}

function dates(count: number, from = '2026-09-01'): string[] {
  return Array.from({ length: count }, (_, i) => {
    const stamp = Date.parse(`${from}T00:00:00Z`) + i * 86_400_000
    return new Date(stamp).toISOString().slice(0, 10)
  })
}

describe('pickRecoverySignal', () => {
  it('prefers HRV over sleep when both have enough mornings', () => {
    const series = dates(7).map((date) => day(date, { hrv: 50, sleepHours: 7 }))
    expect(pickRecoverySignal(series)).toBe('hrv')
  })

  it('falls back to Body Battery, then resting HR, then sleep', () => {
    expect(pickRecoverySignal(dates(7).map((date) => day(date, { bodyBattery: 70 })))).toBe(
      'bodyBattery'
    )
    expect(pickRecoverySignal(dates(7).map((date) => day(date, { restingHr: 52 })))).toBe(
      'restingHr'
    )
    expect(pickRecoverySignal(dates(7).map((date) => day(date, { sleepHours: 7.2 })))).toBe(
      'sleepHours'
    )
  })

  it('stays quiet when no signal has five mornings', () => {
    expect(pickRecoverySignal(dates(4).map((date) => day(date, { hrv: 40 })))).toBeNull()
  })
})

describe('buildAbsorption', () => {
  it('flags the hard day when the next morning is weak, not the easy one', () => {
    const days = dates(10)
    const series = days.map((date, i) => day(date, { hrv: i === 6 ? 30 : 60 }))
    const loads = days.map((date, i) => ({
      date,
      daily_load: i === 5 ? 120 : 20,
    }))

    const result = buildAbsorption({ series, loads })
    if (!result) throw new Error('expected absorption')

    expect(result.days[5].hard).toBe(true)
    expect(result.days[5].strained).toBe(true)
    expect(result.days[5].raw).toBe(30)
    expect(result.days[6].strained).toBe(false)
    expect(result.days[1].strained).toBe(false)
    expect(result.usedFtp).toBe(false)
    expect(result.verdict).toBe('stretched')
  })

  it('treats a high resting HR the next morning as a worse recovery', () => {
    const days = dates(10)
    const series = days.map((date, i) => day(date, { restingHr: i === 6 ? 68 : 50 }))
    const loads = days.map((date, i) => ({
      date,
      daily_load: i === 5 ? 140 : 25,
    }))

    const result = buildAbsorption({ series, loads })
    if (!result) throw new Error('expected absorption')

    expect(result.signal).toBe('restingHr')
    expect(result.days[5].strained).toBe(true)
    expect(result.days[5].recovery).toBe(-68)
    expect(result.days[5].raw).toBe(68)
  })

  it('calls three unabsorbed hard days in a week fading', () => {
    const days = dates(10)
    // Hard on 3, 5, 7; crash mornings on 4, 6, 8 — all inside the last week.
    const series = days.map((date, i) => day(date, { hrv: [4, 6, 8].includes(i) ? 28 : 62 }))
    const loads = days.map((date, i) => ({
      date,
      daily_load: [3, 5, 7].includes(i) ? 150 : 15,
    }))

    const result = buildAbsorption({ series, loads })
    if (!result) throw new Error('expected absorption')

    expect(result.days.filter((d) => d.strained).map((d) => d.date)).toEqual([
      days[3],
      days[5],
      days[7],
    ])
    expect(result.verdict).toBe('fading')
  })

  it('does not call a flat week hard just because every day is similar', () => {
    const days = dates(10)
    const series = days.map((date) => day(date, { hrv: 55 }))
    const loads = days.map((date) => ({ date, daily_load: 40 }))

    const result = buildAbsorption({ series, loads })
    if (!result) throw new Error('expected absorption')

    expect(result.days.every((d) => !d.hard)).toBe(true)
    expect(result.verdict).toBe('absorbing')
  })

  it('uses FTP so a short sharp session counts as hard', () => {
    const days = dates(10)
    const series = days.map((date) => day(date, { hrv: 55 }))
    const loads = days.map((date, i) => ({
      date,
      daily_load: 30,
      intensityFactor: i === 4 ? 0.95 : 0.55,
    }))

    const without = buildAbsorption({ series, loads })
    if (!without) throw new Error('expected absorption')
    expect(without.days[4].hard).toBe(false)
    expect(without.usedFtp).toBe(false)

    const withFtp = buildAbsorption({ series, loads, ftp: 250 })
    if (!withFtp) throw new Error('expected absorption')
    expect(withFtp.usedFtp).toBe(true)
    expect(withFtp.days[4].hard).toBe(true)
    expect(withFtp.days[3].hard).toBe(false)
  })

  it('uses FTP so a long endurance day at 100 TSS counts as hard', () => {
    const days = dates(10)
    const series = days.map((date) => day(date, { hrv: 55 }))
    const loads = days.map((date, i) => ({
      date,
      daily_load: i === 4 ? 110 : 30,
      intensityFactor: 0.65,
    }))

    const without = buildAbsorption({ series, loads })
    if (!without) throw new Error('expected absorption')
    expect(without.days[4].hard).toBe(true)

    const withFtp = buildAbsorption({ series, loads, ftp: 250 })
    if (!withFtp) throw new Error('expected absorption')
    expect(withFtp.days[4].hard).toBe(true)
  })

  it('stays quiet without enough load or enough mornings', () => {
    const days = dates(10)
    expect(
      buildAbsorption({
        series: days.map((date) => day(date, { hrv: 50 })),
        loads: days.map((date) => ({ date, daily_load: 0 })),
      })
    ).toBeNull()

    expect(
      buildAbsorption({
        series: days.map((date) => day(date)),
        loads: days.map((date) => ({ date, daily_load: 40 })),
      })
    ).toBeNull()
  })
})
