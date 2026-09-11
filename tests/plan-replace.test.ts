import { describe, expect, it } from 'vitest'
import { scheduledIdsToReplace, workoutSlot } from '@/lib/training/plan-replace'

describe('workoutSlot', () => {
  it('keeps bike and strength on separate slots', () => {
    expect(workoutSlot({ workout_type: 'endurance', title: 'Z2 suave' })).toBe('bike')
    expect(workoutSlot({ workout_type: 'strength', title: 'Piernas y core' })).toBe('strength')
    expect(workoutSlot({ workout_type: 'endurance', title: 'Fuerza gym' })).toBe('strength')
  })
})

describe('scheduledIdsToReplace', () => {
  const friday = {
    bike: {
      id: 'bike-1',
      scheduled_date: '2026-09-11',
      workout_type: 'endurance',
      title: 'Bici Z2',
      status: 'scheduled',
    },
    strength: {
      id: 'str-1',
      scheduled_date: '2026-09-11',
      workout_type: 'strength',
      title: 'Fuerza',
      status: 'scheduled',
    },
    doneBike: {
      id: 'bike-done',
      scheduled_date: '2026-09-11',
      workout_type: 'threshold',
      title: '3x10',
      status: 'completed',
    },
    saturday: {
      id: 'sat-1',
      scheduled_date: '2026-09-12',
      workout_type: 'endurance',
      title: 'Fondo',
      status: 'scheduled',
    },
  }

  it('replaces only the bike when the change is a shorter ride', () => {
    const ids = scheduledIdsToReplace(
      [friday.bike, friday.strength, friday.saturday],
      [{ scheduled_date: '2026-09-11', workout_type: 'endurance', title: 'Z2 60 min' }]
    )
    expect(ids).toEqual(['bike-1'])
  })

  it('replaces only strength when that is the session being changed', () => {
    const ids = scheduledIdsToReplace(
      [friday.bike, friday.strength],
      [{ scheduled_date: '2026-09-11', workout_type: 'strength', title: 'Core' }]
    )
    expect(ids).toEqual(['str-1'])
  })

  it('leaves completed sessions and other days alone', () => {
    const ids = scheduledIdsToReplace(
      [friday.doneBike, friday.strength, friday.saturday],
      [{ scheduled_date: '2026-09-11', workout_type: 'endurance', title: 'Z2' }]
    )
    expect(ids).toEqual([])
  })
})
