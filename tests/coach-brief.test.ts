import { describe, expect, it } from 'vitest'
import {
  availabilityRowsFromBrief,
  cycleBriefGaps,
  formatTrainingBrief,
  isCycleBriefComplete,
  normalizeTrainingBrief,
  tryParseBrief,
} from '@/lib/training/coach-brief'
import { splitPlanBlock } from '@/lib/training/coach-plan'

describe('normalizeTrainingBrief', () => {
  it('maps aliases, hours and Spanish weekdays', () => {
    const brief = normalizeTrainingBrief({
      goal: 'mantenimiento',
      semanas: 12,
      fuerza: 'sí',
      availability: [{ day: 'lunes', bike_hours: 1.5, strength_minutes: 40 }],
    })
    expect(brief).toMatchObject({
      goal_kind: 'maintenance',
      horizon_weeks: 12,
      include_strength: true,
    })
    expect(brief?.availability).toEqual([{ day_of_week: 1, bike_minutes: 90, strength_minutes: 40 }])
  })

  it('maps strength equipment and recurring issues', () => {
    const withGym = normalizeTrainingBrief({
      goal_kind: 'ftp',
      horizon_weeks: 8,
      include_strength: true,
      implementos: 'gimnasio',
      molestias: 'rodilla izquierda en sentadilla',
    })
    expect(withGym).toMatchObject({
      include_strength: true,
      strength_equipment: 'gym',
      recurring_issues: 'rodilla izquierda en sentadilla',
    })
    expect(isCycleBriefComplete(withGym)).toBe(true)

    const bodyweightNone = normalizeTrainingBrief({
      goal: 'mantenimiento',
      semanas: 4,
      fuerza: 'sí',
      strength_equipment: 'peso corporal',
      recurring_issues: 'ninguna',
    })
    expect(bodyweightNone).toMatchObject({
      strength_equipment: 'bodyweight',
      recurring_issues: '',
    })
    expect(isCycleBriefComplete(bodyweightNone)).toBe(true)

    const missing = normalizeTrainingBrief({
      goal_kind: 'ftp',
      horizon_weeks: 8,
      include_strength: true,
    })
    expect(isCycleBriefComplete(missing)).toBe(false)
    expect(cycleBriefGaps(missing).join(' ')).toMatch(/implementos/)
    expect(cycleBriefGaps(missing).join(' ')).toMatch(/molestias/)
  })

  it('does not treat a plan JSON as a brief', () => {
    expect(
      normalizeTrainingBrief({
        emphasis: 'build',
        workouts: [{ date: '2026-09-08', type: 'endurance', duration_minutes: 60 }],
      })
    ).toBeNull()
  })

  it('fills a seven-day availability grid and zeroes strength when not included', () => {
    const brief = normalizeTrainingBrief({
      goal_kind: 'ftp',
      horizon_weeks: 8,
      include_strength: false,
      availability: [{ day_of_week: 2, bike_minutes: 60, strength_minutes: 45 }],
    })
    expect(brief).not.toBeNull()
    const rows = availabilityRowsFromBrief(brief!)
    expect(rows).toHaveLength(7)
    expect(rows[2]).toEqual({ day_of_week: 2, bike_minutes: 60, strength_minutes: 0 })
    expect(rows.filter((d) => d.bike_minutes > 0)).toHaveLength(1)
  })
})

describe('tryParseBrief', () => {
  it('reads a fenced brief payload', () => {
    const brief = tryParseBrief(
      '{"goal_kind":"race","goal_label":"gran fondo","horizon_weeks":8,"include_strength":true,"availability":[{"day_of_week":6,"bike_minutes":180}]}'
    )
    expect(brief).toMatchObject({ goal_kind: 'race', goal_label: 'gran fondo', horizon_weeks: 8 })
  })
})

describe('formatTrainingBrief', () => {
  it('asks the coach to question when there is no brief', () => {
    const text = formatTrainingBrief(null).join('\n')
    expect(text).toMatch(/sin brief/)
    expect(text).toMatch(/ciclo o macro NUEVO/)
    expect(text).toMatch(/No inventes/)
    expect(text).toMatch(/ciclo en curso/)
  })

  it('frames the next proposal as a 4-week cycle inside the macro', () => {
    const text = formatTrainingBrief({
      goal_kind: 'maintenance',
      horizon_weeks: 12,
      include_strength: true,
    }).join('\n')
    expect(text).toMatch(/12 semanas/)
    expect(text).toMatch(/4 semanas/)
    expect(text).not.toMatch(/semana suelta de una/)
  })

  it('flags missing equipment and niggles until they are asked', () => {
    const incomplete = formatTrainingBrief({
      goal_kind: 'maintenance',
      horizon_weeks: 12,
      include_strength: true,
    }).join('\n')
    expect(incomplete).toMatch(/implementos: FALTA/)
    expect(incomplete).toMatch(/molestias: FALTA/)

    const complete = formatTrainingBrief({
      goal_kind: 'maintenance',
      horizon_weeks: 12,
      include_strength: true,
      strength_equipment: 'home',
      recurring_issues: '',
    }).join('\n')
    expect(complete).toMatch(/casa \(bandas o pesas\)/)
    expect(complete).toMatch(/molestias: ninguna declarada/)
    expect(complete).not.toMatch(/FALTA/)
  })
})

describe('splitPlanBlock brief', () => {
  it('hides a brief fence from the athlete and keeps the plan', () => {
    const { text, plan, brief } = splitPlanBlock(
      [
        'Así queda el ciclo.',
        '',
        '```brief',
        '{"goal_kind":"maintenance","horizon_weeks":12,"include_strength":false,"availability":[{"day_of_week":1,"bike_minutes":90}]}',
        '```',
        '',
        '```plan',
        '{"emphasis":"maintenance","workouts":[{"date":"2026-09-08","type":"endurance","duration_minutes":60,"title":"Z2"}]}',
        '```',
      ].join('\n')
    )
    expect(text).toBe('Así queda el ciclo.')
    expect(brief?.goal_kind).toBe('maintenance')
    expect(brief?.availability[0]).toEqual({ day_of_week: 1, bike_minutes: 90, strength_minutes: 0 })
    expect(plan?.workouts).toHaveLength(1)
  })
})
