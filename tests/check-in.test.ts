import { describe, expect, it } from 'vitest'
import {
  bodyFeelFromSoreness,
  moodFromMotivation,
  motivationFromMood,
  sorenessFromBody,
} from '@/lib/training/check-in'

describe('morning check-in chips', () => {
  it('maps body and mood both ways', () => {
    expect(sorenessFromBody('fresco')).toBe(2)
    expect(sorenessFromBody('roto')).toBe(9)
    expect(bodyFeelFromSoreness(2)).toBe('fresco')
    expect(bodyFeelFromSoreness(9)).toBe('roto')
    expect(motivationFromMood('full')).toBe(9)
    expect(moodFromMotivation(4)).toBe('flojas')
    expect(bodyFeelFromSoreness(null)).toBeNull()
  })
})
