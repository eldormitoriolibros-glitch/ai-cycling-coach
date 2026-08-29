import { describe, it, expect } from 'vitest'
import { computeReadiness, formatReadiness, formatAthleteState } from '@/lib/training/readiness'

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
