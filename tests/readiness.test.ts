import { describe, it, expect } from 'vitest'
import { computeReadiness, formatReadiness, formatAthleteState } from '@/lib/training/readiness'
import { buildReadinessInput } from '@/lib/training/readiness-input'

describe('readiness', () => {
  it('returns high readiness for good signals', () => {
    const r = computeReadiness({
      form: 10,
      restingHr: 50,
      baselineRestingHr: 50,
      hrv: 65,
      baselineHrv: 60,
      sleepHours: 8,
      sleepScore: 80,
      soreness: 2,
      motivation: 8,
      bodyBattery: null,
      stressAvg: null,
      spo2: null,
    })
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.label).toMatch(/Listo|Aceptable|Cargado|Necesit/)
    const lines = formatReadiness(r)
    expect(lines[0]).toContain('readiness:')
  })

  it('flags low readiness for bad signals', () => {
    const r = computeReadiness({
      form: -30,
      restingHr: 70,
      baselineRestingHr: 55,
      hrv: 30,
      baselineHrv: 60,
      sleepHours: 4.5,
      sleepScore: 40,
      soreness: 8,
      motivation: 3,
      bodyBattery: null,
      stressAvg: null,
      spo2: null,
    })
    expect(r.score).toBeLessThanOrEqual(50)
    expect(r.flags.length).toBeGreaterThan(0)
  })

  it('incorporates Garmin health signals when present', () => {
    const r = computeReadiness({
      form: 5,
      restingHr: 52,
      baselineRestingHr: 50,
      hrv: 55,
      baselineHrv: 50,
      sleepHours: 7,
      sleepScore: 75,
      soreness: null,
      motivation: null,
      bodyBattery: 85,
      stressAvg: 20,
      spo2: 97,
    })
    expect(r.score).toBeGreaterThanOrEqual(65)
    expect(r.dataSources).toContain('garmin')
    expect(r.flags).not.toContain('estrés alto')
  })

  it('flags high stress and low Body Battery', () => {
    const r = computeReadiness({
      form: -10,
      restingHr: 60,
      baselineRestingHr: 55,
      hrv: 40,
      baselineHrv: 60,
      sleepHours: 5.5,
      sleepScore: 50,
      soreness: null,
      motivation: null,
      bodyBattery: 15,
      stressAvg: 60,
      spo2: 95,
    })
    expect(r.flags).toContain('estrés alto')
    expect(r.flags).toContain('Body Battery baja')
    expect(r.dataSources).toContain('garmin')
  })

  it('gracefully handles no data', () => {
    const r = computeReadiness({
      form: null,
      restingHr: null,
      baselineRestingHr: null,
      hrv: null,
      baselineHrv: null,
      sleepHours: null,
      sleepScore: null,
      soreness: null,
      motivation: null,
      bodyBattery: null,
      stressAvg: null,
      spo2: null,
    })
    expect(r.score).toBe(60)
    expect(r.dataSources).toContain('sin datos')
  })

  it('formatAthleteState shows available data', () => {
    const r = computeReadiness({
      form: 5,
      restingHr: 50,
      baselineRestingHr: 50,
      hrv: 55,
      baselineHrv: 50,
      sleepHours: 7.5,
      sleepScore: 80,
      soreness: 3,
      motivation: 7,
      bodyBattery: 70,
      stressAvg: 25,
      spo2: null,
    })
    const lines = formatAthleteState({
      readiness: r,
      form: 5,
      sleepHours: 7.5,
      sleepScore: 80,
      restingHr: 50,
      hrv: 55,
      bodyBatteryHigh: 70,
      stressAvg: 25,
      spo2Avg: null,
      soreness: 3,
      motivation: 7,
    })
    expect(lines[0]).toContain('readiness:')
    expect(lines.some((l) => l.includes('Body Battery'))).toBe(true)
    expect(lines.some((l) => l.includes('dolor'))).toBe(true)
    expect(lines.some((l) => l.includes('fuente:'))).toBe(true)
  })
})

describe('buildReadinessInput', () => {
  const recovery = [
    { resting_hr: 58, hrv: 45, stress: 30, soreness: 4, motivation: 7, body_battery_high: 80, spo2_avg: 96 },
    { resting_hr: 52, hrv: 55, stress: null, soreness: null, motivation: null },
    { resting_hr: null, hrv: null, stress: null, soreness: null, motivation: null },
  ]

  it('takes the latest row and averages the rest as baseline', () => {
    const input = buildReadinessInput({
      form: -5,
      recovery,
      sleep: [{ duration_minutes: 450, sleep_score: 72 }, { duration_minutes: 400, sleep_score: 60 }],
    })

    expect(input.restingHr).toBe(58)
    expect(input.baselineRestingHr).toBe(55)
    expect(input.hrv).toBe(45)
    expect(input.baselineHrv).toBe(50)
    expect(input.sleepHours).toBe(7.5)
    expect(input.sleepScore).toBe(72)
    expect(input.bodyBattery).toBe(80)
  })

  it('returns nulls when there is nothing stored', () => {
    const input = buildReadinessInput({ form: null, recovery: [], sleep: [] })
    expect(input.restingHr).toBeNull()
    expect(input.baselineHrv).toBeNull()
    expect(input.sleepHours).toBeNull()
    expect(computeReadiness(input).dataSources).toContain('sin datos')
  })
})
