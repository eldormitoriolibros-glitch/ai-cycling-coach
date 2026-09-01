import { describe, expect, it } from 'vitest'
import { formatDailyNudge, type NudgeWorkout } from '@/lib/coach/nudge-format'

function w(partial: Partial<NudgeWorkout> & { title: string; status: string }): NudgeWorkout {
  return {
    description: null,
    duration_minutes: 60,
    target_zone: 'Z2',
    target_power: null,
    target_hr: null,
    purpose: null,
    workout_type: null,
    ...partial,
  }
}

describe('formatDailyNudge', () => {
  it('is a rest day when there are no workouts', () => {
    const text = formatDailyNudge({ name: 'Fede', workouts: [], load: null })
    expect(text).toContain('Día libre')
  })

  it('still flags pending strength after the bike is marked done', () => {
    const text = formatDailyNudge({
      name: 'Fede',
      workouts: [
        w({ title: 'Fondo aeróbico', status: 'completed', workout_type: 'endurance' }),
        w({
          title: 'Fuerza liviana',
          status: 'scheduled',
          workout_type: 'strength',
          target_zone: 'Fuerza',
          duration_minutes: 30,
        }),
      ],
      load: null,
    })
    expect(text).not.toContain('Día libre')
    expect(text).not.toContain('Nada pendiente')
    expect(text).toContain('Fondo aeróbico')
    expect(text).toContain('Fuerza')
    expect(text).toContain('pendiente')
  })

  it('says nothing is left when every session is done', () => {
    const text = formatDailyNudge({
      name: null,
      workouts: [
        w({ title: 'Fondo', status: 'completed', workout_type: 'endurance' }),
        w({ title: 'Fuerza', status: 'completed', workout_type: 'strength' }),
      ],
      load: null,
    })
    expect(text).toContain('Nada pendiente')
    expect(text).toContain('Bici')
    expect(text).toContain('Fuerza')
  })
})
