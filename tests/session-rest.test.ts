import { describe, expect, it } from 'vitest'
import {
  expandIntervalShorthand,
  parseCompactIntervals,
  parseRestMinutes,
} from '@/lib/training/session-prescription'
import { blocksForBikeSession } from '@/lib/training/workout-blocks'

describe('parseRestMinutes', () => {
  it('reads the recovery the coach wrote in prose', () => {
    expect(parseRestMinutes('4x5m en Z4 recuperando 3m suave entre series')).toBe(3)
    expect(parseRestMinutes('4 bloques de 5 min con 3 min suaves entre cada uno')).toBe(3)
    expect(parseRestMinutes('5x4 min Z4, recuperación de 2 min')).toBe(2)
    expect(parseRestMinutes('4x5m/3m')).toBe(3)
  })

  it('returns null when no rest is stated', () => {
    expect(parseRestMinutes('4x5m Z4 cadencia alta')).toBeNull()
    expect(parseRestMinutes('')).toBeNull()
  })

  it('ignores implausible values', () => {
    expect(parseRestMinutes('recuperando 90 min')).toBeNull()
  })
})

describe('parseCompactIntervals', () => {
  it('keeps the stated rest instead of inferring it', () => {
    const compact = parseCompactIntervals('4x5m Z4 recuperando 3m suave entre series')
    expect(compact).toMatchObject({ repeats: 4, minutes: 5, restMinutes: 3, restExplicit: true })
  })

  it('falls back to the heuristic when the rest is missing', () => {
    const compact = parseCompactIntervals('4x5m Z4 cadencia alta')
    expect(compact).toMatchObject({ restMinutes: 5, restExplicit: false })
  })
})

describe('expandIntervalShorthand', () => {
  it('takes the rest from the coach description when the title omits it', () => {
    expect(
      expandIntervalShorthand('Bici 4×5m Z4 cadencia alta', '4 bloques de 5 min con 3 min suaves entre cada uno')
    ).toContain('3 min suaves')
  })

  it('does not invent a rest longer than what was prescribed', () => {
    const expanded = expandIntervalShorthand('Bici 4×5m Z4', 'recuperando 3m entre series')
    expect(expanded).toContain('3 min suaves')
    expect(expanded).not.toContain('5 min suaves')
  })
})

describe('blocksForBikeSession', () => {
  it('shows the recovery the prescription states, not the interval length', () => {
    const blocks = blocksForBikeSession({
      title: 'Bici 4×5m Z4 cadencia alta',
      description:
        '20 min de entrada en calor progresiva en Z1–Z2. 4 bloques de 5 min en Z4 con 3 min suaves entre cada uno. 10 min de vuelta a la calma en Z1.',
      minutes: 120,
      zone: 'Z4',
      kind: 'threshold',
    })

    const recovery = blocks.find((b) => b.label === 'Recuperación entre series')
    expect(recovery?.minutes).toBe(3)
    expect(recovery?.repeats).toBe(3)
  })

  it('keeps the warmup stated in the prescription', () => {
    const blocks = blocksForBikeSession({
      title: 'Bici 4×5m Z4',
      description: '20 min de entrada en calor progresiva en Z1–Z2. 10 min de vuelta a la calma en Z1.',
      minutes: 120,
      zone: 'Z4',
      kind: 'threshold',
    })

    expect(blocks.find((b) => b.label === 'Entrada en calor')?.minutes).toBe(20)
  })
})
