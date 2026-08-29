import { describe, it, expect } from 'vitest'
import { buildAthleteProfile, formatAthleteProfile } from '@/lib/training/athlete-profile'

describe('athlete-profile', () => {
  it('builds a profile and formats lines', () => {
    const current = [
      { duration: 5, watts: 1000, activityId: 'a1', date: '2026-08-01', title: null, fromPowerMeter: true },
      { duration: 60, watts: 450, activityId: 'a2', date: '2026-07-30', title: null, fromPowerMeter: true },
      { duration: 300, watts: 340, activityId: 'a3', date: '2026-07-20', title: null, fromPowerMeter: true },
      { duration: 1200, watts: 290, activityId: 'a4', date: '2026-06-20', title: null, fromPowerMeter: true },
      { duration: 3600, watts: 255, activityId: 'a5', date: '2026-05-10', title: null, fromPowerMeter: true },
    ]
    const previous = [
      { duration: 5, watts: 980, activityId: 'b1', date: '2026-05-01', title: null, fromPowerMeter: true },
      { duration: 60, watts: 440, activityId: 'b2', date: '2026-04-30', title: null, fromPowerMeter: true },
      { duration: 300, watts: 330, activityId: 'b3', date: '2026-04-20', title: null, fromPowerMeter: true },
      { duration: 1200, watts: 290, activityId: 'b4', date: '2026-03-20', title: null, fromPowerMeter: true },
      { duration: 3600, watts: 250, activityId: 'b5', date: '2026-02-10', title: null, fromPowerMeter: true },
    ]

    const profile = buildAthleteProfile(current as any, previous as any)
    expect(profile.sprintPower).toBe(1000)
    expect(profile.thresholdPower).toBe(290)
    expect(profile.anaerobicReserveRatio).toBeCloseTo(340 / 290, 2)
    expect(profile.phenotype).toBeDefined()

    const lines = formatAthleteProfile(profile)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join(' ')).toContain('sprint 5s')
    expect(lines.join(' ')).toMatch(/fenotipo|fenotipo:|fenotipo/)
  })
})

