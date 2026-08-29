import { describe, expect, it } from 'vitest'
import { looksCombined, splitCombinedSession } from '@/lib/training/split-sessions'

describe('splitCombinedSession', () => {
  it('splits labeled bike + strength titles', () => {
    const parts = splitCombinedSession('Bici Z2 (60m) + Fuerza liviana (30m)', 90)
    expect(parts).toEqual([
      { kind: 'bike', title: 'Bici Z2', duration_minutes: 60 },
      { kind: 'strength', title: 'Fuerza liviana', duration_minutes: 30 },
    ])
  })

  it('defaults strength to 30 when only the total is known', () => {
    const parts = splitCombinedSession('Bici Z2 + Core y movilidad', 90)
    expect(looksCombined('Bici Z2 + Core y movilidad')).toBe(true)
    expect(parts).toHaveLength(2)
    expect(parts?.[1]).toMatchObject({ kind: 'strength', duration_minutes: 30 })
    expect(parts?.[0].duration_minutes).toBe(60)
  })
})
