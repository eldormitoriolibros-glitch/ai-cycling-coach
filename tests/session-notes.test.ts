import { describe, expect, it } from 'vitest'
import { considerationsFor, hasIntervalSeries } from '@/lib/training/session-notes'
import { resolveSessionKind } from '@/lib/training/session-prescription'

describe('considerationsFor', () => {
  it('does not add a canned cue on a group ride', () => {
    const tip = considerationsFor({
      kind: 'vo2max',
      title: 'Salida grupal de intensidad',
      description:
        '20 min de entrada en calor en Z1. 75 min de trabajo de intensidad en grupeta con relevos y cambios de ritmo (Z3-Z5). 15 min de vuelta a la calma en Z1.',
    })
    expect(tip).toBeNull()
  })

  it('keeps the VO2 series cue when the session actually has repeats', () => {
    const tip = considerationsFor({
      kind: 'vo2max',
      title: 'VO2 5x3m',
      description: '5 bloques de 3 min en Z5 con 3 min suaves entre cada uno.',
    })
    expect(tip).toMatch(/últimos 30/)
  })

  it('does not treat a hard continuous block as interval VO2', () => {
    const tip = considerationsFor({
      kind: 'vo2max',
      title: 'Bloque duro continuo',
      description: '20 min de entrada. 40 min en Z4. 15 min de vuelta.',
    })
    expect(tip).not.toMatch(/entre series/)
    expect(tip).toMatch(/continuo|sostenid/i)
  })
})

describe('hasIntervalSeries', () => {
  it('detects written repeats and ignores a group-ride prose', () => {
    expect(hasIntervalSeries('4x5m Z5')).toBe(true)
    expect(hasIntervalSeries('3 bloques de 8 min al FTP')).toBe(true)
    expect(hasIntervalSeries('75 min de trabajo de intensidad en grupeta (Z3-Z5)')).toBe(false)
  })
})

describe('resolveSessionKind', () => {
  it('does not call a group ride VO2max just because the range reaches Z5', () => {
    expect(
      resolveSessionKind({
        type: 'vo2max',
        title: 'Salida grupal de intensidad',
        description: '75 min de trabajo de intensidad en grupeta (Z3-Z5).',
        zone: 'Z4',
      })
    ).toBe('threshold')
  })
})
