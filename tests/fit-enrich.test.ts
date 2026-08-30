import { describe, expect, it } from 'vitest'
import { findMatch, findTimeMatch, type ExistingActivity } from '@/lib/garmin/activity-match'
import type { ParsedFitActivity } from '@/lib/garmin/fit'

function candidate(overrides: Partial<ExistingActivity> & { id: string; start_time: string }): ExistingActivity {
  return {
    id: overrides.id,
    title: overrides.title ?? null,
    start_time: overrides.start_time,
    duration_seconds: overrides.duration_seconds ?? null,
    moving_seconds: overrides.moving_seconds ?? null,
    distance_meters: overrides.distance_meters ?? null,
    avg_hr: null,
    max_hr: null,
    avg_cadence: null,
    max_cadence: null,
    avg_power: null,
    max_power: null,
    avg_speed: null,
    max_speed: null,
    elevation_gain_meters: null,
    avg_temperature: null,
    max_temperature: null,
    training_effect_aerobic: null,
    training_effect_anaerobic: null,
    avg_respiration_rate: null,
    calories: null,
    sweat_loss_ml: null,
    garmin_training_load: null,
    has_power_meter: false,
    kilojoules: null,
    training_load: null,
  }
}

const fitToday: ParsedFitActivity = {
  startTime: '2026-08-30T05:45:00.000Z',
  title: 'Ride',
  activityType: 'cycling',
  sportType: 'Ride',
  durationSeconds: 5400,
  distanceMeters: 42000,
  avgSpeed: null,
  maxSpeed: null,
  avgHr: null,
  maxHr: null,
  avgCadence: null,
  maxCadence: null,
  elevationGain: null,
  avgPower: null,
  maxPower: null,
  kilojoules: null,
  hasPowerMeter: false,
  avgTemperature: null,
  maxTemperature: null,
  trainingEffectAerobic: null,
  trainingEffectAnaerobic: null,
  avgRespirationRate: null,
  calories: null,
  sweatLossMl: null,
  garminTrainingLoad: null,
  records: [],
  garminActivityId: '12345',
}

describe('findMatch', () => {
  it('does not match same distance/duration on a different day', () => {
    const oldRide = candidate({
      id: 'old',
      start_time: '2026-08-09T05:45:00.000Z',
      distance_meters: 42000,
      moving_seconds: 5400,
    })

    expect(findMatch(fitToday, [oldRide], new Set())).toBeNull()
  })
})

describe('findTimeMatch', () => {
  it('matches only when start times are within 5 minutes', () => {
    const close = candidate({
      id: 'close',
      start_time: '2026-08-30T05:47:00.000Z',
    })
    const far = candidate({
      id: 'far',
      start_time: '2026-08-09T05:45:00.000Z',
    })

    expect(findTimeMatch(fitToday, [close], new Set())?.id).toBe('close')
    expect(findTimeMatch(fitToday, [far], new Set())).toBeNull()
  })
})
