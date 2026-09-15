import { describe, expect, it } from 'vitest'
import {
  normalizeCoachPlan,
  normalizeIsoDate,
  normalizeMinutes,
  normalizeSessionType,
  splitPlanBlock,
  tryParsePlan,
} from '@/lib/training/coach-plan'

describe('normalizeCoachPlan', () => {
  it('pads dates, coerces duration strings and maps aliases', () => {
    const plan = normalizeCoachPlan({
      emphasis: 'build',
      workouts: [
        { date: '2026-9-8', type: 'sweet spot', duration_minutes: '120', title: 'Bici Z4' },
        { scheduled_date: '08/09/2026', workout_type: 'fuerza', duration: '30 min', title: 'Piernas y Core' },
      ],
    })
    expect(plan?.workouts).toEqual([
      { date: '2026-09-08', type: 'threshold', duration_minutes: 120, title: 'Bici Z4', description: undefined, target_zone: 'Z4' },
      { date: '2026-09-08', type: 'strength', duration_minutes: 30, title: 'Piernas y Core', description: undefined, target_zone: 'Fuerza' },
    ])
  })

  it('drops sessions without a usable date', () => {
    expect(normalizeIsoDate('martes')).toBeNull()
    expect(normalizeCoachPlan({ workouts: [{ date: 'hoy', type: 'endurance', duration_minutes: 60 }] })).toBeNull()
  })

  it('prefers 3x10 Z4 in the title over a generic endurance type', () => {
    const plan = normalizeCoachPlan({
      workouts: [
        {
          date: '2026-09-08',
          type: 'endurance',
          duration_minutes: 120,
          title: 'Bici 3x10m Z4/Sweet Spot',
        },
      ],
    })
    expect(plan?.workouts[0]).toMatchObject({ type: 'threshold', target_zone: 'Z4' })
  })

  it('maps common type labels', () => {
    expect(normalizeSessionType('Z2')).toBe('endurance')
    expect(normalizeSessionType('umbral')).toBe('threshold')
    expect(normalizeSessionType('VO2max')).toBe('vo2max')
    expect(normalizeMinutes('90 min')).toBe(90)
  })
})

describe('splitPlanBlock', () => {
  it('extracts a fenced plan block and hides it from the athlete', () => {
    const { text, plan } = splitPlanBlock(
      'Ya queda agendada.\n\n```plan\n{"emphasis":"maintenance","workouts":[{"date":"2026-09-08","type":"threshold","duration_minutes":120,"title":"Bici"},{"date":"2026-09-08","type":"strength","duration_minutes":30,"title":"Fuerza"}]}\n```'
    )
    expect(text).toBe('Ya queda agendada.')
    expect(plan?.workouts).toHaveLength(2)
    expect(plan?.workouts[0].date).toBe('2026-09-08')
  })

  it('recovers JSON even when duration is a string', () => {
    const plan = tryParsePlan(
      '{"workouts":[{"date":"2026-09-08","type":"endurance","duration_minutes":"75","title":"Z2"}]}'
    )
    expect(plan?.workouts[0]).toMatchObject({ date: '2026-09-08', type: 'endurance', duration_minutes: 75 })
  })

  it('keeps a visible week table when the plan fence is cut off', () => {
    const { text, plan } = splitPlanBlock(
      'Te armé la propuesta para esa semana:\n\n| Día | Sesión | Duración |\n| lun | Z2 | 60 |\n\n```plan\n{"emphasis":"recovery","workouts":[{"date":"2026-09-28"'
    )
    expect(text).toMatch(/Día/)
    expect(text).toMatch(/Z2/)
    expect(plan).toBeNull()
  })
})
