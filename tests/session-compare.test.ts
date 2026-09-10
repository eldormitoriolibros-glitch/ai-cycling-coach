import { describe, expect, it } from 'vitest'
import { compareSession, formatSessionComparison } from '@/lib/coach/session-compare'
import { formatExecution } from '@/lib/coach/execution'

describe('compareSession', () => {
  it('marks a missing ride', () => {
    const result = compareSession({
      workoutType: 'endurance',
      durationMinutes: 90,
      targetPower: null,
      targetHr: null,
      hasActivity: false,
      movingSeconds: null,
      avgPower: null,
      normalizedPower: null,
      intensityFactor: null,
      avgHr: null,
    })
    expect(result.verdict).toBe('sin_salida')
    expect(result.label).toBe('sin salida')
  })

  it('flags power well below the target as easier', () => {
    const result = compareSession({
      workoutType: 'threshold',
      durationMinutes: 90,
      targetPower: 250,
      targetHr: null,
      hasActivity: true,
      movingSeconds: 90 * 60,
      avgPower: 200,
      normalizedPower: 210,
      intensityFactor: 0.84,
      avgHr: null,
    })
    expect(result.verdict).toBe('mas_suave')
    expect(result.notes.some((n) => n.includes('210 W vs 250 W'))).toBe(true)
  })

  it('flags a much shorter ride when intensity is unknown', () => {
    const result = compareSession({
      workoutType: 'endurance',
      durationMinutes: 90,
      targetPower: null,
      targetHr: null,
      hasActivity: true,
      movingSeconds: 50 * 60,
      avgPower: null,
      normalizedPower: null,
      intensityFactor: null,
      avgHr: null,
    })
    expect(result.verdict).toBe('mas_corto')
  })

  it('counts work laps against a 3x10 title', () => {
    const ok = compareSession({
      workoutType: 'threshold',
      title: 'Bici Over-Unders 3×10m',
      durationMinutes: 90,
      targetPower: 240,
      targetHr: null,
      hasActivity: true,
      movingSeconds: 90 * 60,
      avgPower: 238,
      normalizedPower: 242,
      intensityFactor: 0.88,
      avgHr: null,
      laps: [
        { moving_seconds: 15 * 60, avg_power: 140 },
        { moving_seconds: 10 * 60, avg_power: 240 },
        { moving_seconds: 5 * 60, avg_power: 120 },
        { moving_seconds: 10 * 60, avg_power: 238 },
        { moving_seconds: 5 * 60, avg_power: 120 },
        { moving_seconds: 10 * 60, avg_power: 241 },
        { moving_seconds: 20 * 60, avg_power: 130 },
      ],
    })
    expect(ok.verdict).toBe('como_prescripto')
    expect(ok.notes.some((n) => n.includes('vueltas de trabajo: 3'))).toBe(true)

    const missed = compareSession({
      workoutType: 'threshold',
      title: 'Bici 3×10m Z4',
      durationMinutes: 90,
      targetPower: 240,
      targetHr: null,
      hasActivity: true,
      movingSeconds: 90 * 60,
      avgPower: 200,
      normalizedPower: 205,
      intensityFactor: 0.75,
      avgHr: null,
      laps: [
        { moving_seconds: 40 * 60, avg_power: 180 },
        { moving_seconds: 10 * 60, avg_power: 240 },
      ],
    })
    expect(missed.verdict).toBe('calidad_fallida')
  })

  it('treats a hard endurance IF as a failed Z2, not extra stimulus', () => {
    const result = compareSession({
      workoutType: 'endurance',
      durationMinutes: 90,
      targetPower: null,
      targetHr: null,
      hasActivity: true,
      movingSeconds: 90 * 60,
      avgPower: 220,
      normalizedPower: 230,
      intensityFactor: 0.82,
      avgHr: null,
    })
    expect(result.verdict).toBe('mas_duro')
    expect(result.notes.some((n) => n.includes('Z2 fallido'))).toBe(true)
  })
})

describe('formatSessionComparison', () => {
  it('starts with the computed verdict', () => {
    const lines = formatSessionComparison({
      verdict: 'mas_suave',
      label: 'más suave',
      notes: ['potencia 210 W vs 250 W objetivo (−16%)'],
    })
    expect(lines[0]).toBe('veredicto: más suave')
    expect(lines[1]).toMatch(/210 W/)
  })
})

describe('formatExecution', () => {
  it('prefers the linked activity and uses the computed label', () => {
    const lines = formatExecution(
      [
        {
          scheduled_date: '2026-09-10',
          title: 'Bici Z2',
          workout_type: 'endurance',
          duration_minutes: 90,
          status: 'completed',
          target_zone: 'Z2',
          target_power: null,
          target_hr: null,
          completed_activity_id: 'ride-2',
        },
      ],
      [
        {
          id: 'ride-1',
          start_time: '2026-09-10T10:00:00Z',
          title: 'basura',
          sport_type: 'Ride',
          moving_seconds: 20 * 60,
          avg_power: 90,
          normalized_power: 90,
          intensity_factor: 0.4,
          avg_hr: null,
          training_load: 10,
        },
        {
          id: 'ride-2',
          start_time: '2026-09-10T16:00:00Z',
          title: 'fondo',
          sport_type: 'Ride',
          moving_seconds: 90 * 60,
          avg_power: 180,
          normalized_power: 185,
          intensity_factor: 0.68,
          avg_hr: null,
          training_load: 70,
        },
      ],
      'UTC',
      '2026-09-10'
    )
    expect(lines[0]).toMatch(/90 min/)
    expect(lines[0]).toMatch(/como lo prescripto/)
    expect(lines[0]).not.toMatch(/más suave/)
  })
})
