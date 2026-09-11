import { describe, expect, it } from 'vitest'
import {
  parseWorkoutBlocks,
  strengthExercises,
  formatBikeDescription,
  blocksForBikeSession,
  buildBikeSessionDescription,
  commitSessionDescription,
  dedupeWarmupCooldownProse,
} from '@/lib/training/workout-blocks'

describe('parseWorkoutBlocks', () => {
  it('parses a threshold session into warmup, intervals, recoveries and cooldown', () => {
    const blocks = parseWorkoutBlocks(
      '15 min de entrada, 4 bloques de 8 min al FTP con 4 min suaves entre cada uno, 10 min de vuelta a la calma.'
    )
    expect(blocks.map((b) => b.label)).toEqual([
      'Entrada en calor',
      'Intervalos',
      'Recuperación entre series',
      'Vuelta a la calma',
    ])
    expect(blocks[1]).toMatchObject({ minutes: 8, repeats: 4, intensity: 'FTP / Z4' })
  })

  it('returns a default strength table for generic descriptions', () => {
    expect(strengthExercises('Sesión de fuerza, independiente de la bici.')).toHaveLength(6)
    expect(strengthExercises('Circuito de sentadillas, fondos y plancha 3x12')).toEqual([])
  })

  it('always includes warmup and cooldown in a Z2 description', () => {
    const text = formatBikeDescription({
      kind: 'endurance',
      totalMinutes: 90,
      zone: 'Z2',
      mainWork: 'Ritmo constante en Z2',
    })
    expect(text).toMatch(/entrada en calor/)
    expect(text).toMatch(/vuelta a la calma/)
    expect(text).toMatch(/90 min/)
    const blocks = blocksForBikeSession({ description: text, minutes: 90, zone: 'Z2', kind: 'endurance' })
    expect(blocks[0].label).toBe('Entrada en calor')
    expect(blocks[blocks.length - 1].label).toBe('Vuelta a la calma')
  })

  it('injects warmup and cooldown when the original text omitted them', () => {
    const blocks = blocksForBikeSession({
      description: 'Ritmo constante en Z2.',
      minutes: 75,
      zone: 'Z2',
      kind: 'endurance',
    })
    expect(blocks.map((b) => b.label)).toContain('Entrada en calor')
    expect(blocks.map((b) => b.label)).toContain('Vuelta a la calma')
  })

  it('reads 3x10m Z4 from the title even if the description is a generic Z2', () => {
    const blocks = blocksForBikeSession({
      title: 'Bici 3x10m Z4/Sweet Spot',
      description: '15 min de entrada en calor en Z1–Z2. Ritmo constante en Z2. Tenés que poder mantener una conversación todo el rato. 10 min de vuelta a la calma en Z1.',
      minutes: 120,
      zone: 'Z2',
      kind: 'endurance',
    })
    expect(blocks.map((b) => b.label)).toContain('Intervalos')
    expect(blocks.find((b) => b.label === 'Intervalos')).toMatchObject({ repeats: 3, minutes: 10, intensity: 'Z4' })
    expect(blocks.some((b) => b.label === 'Bloque principal' && b.intensity === 'Z2')).toBe(false)
  })
})

describe('formatBikeDescription', () => {
  it('does not wrap a main block that already has entrada and vuelta', () => {
    const text = formatBikeDescription({
      kind: 'threshold',
      totalMinutes: 90,
      zone: 'Z4',
      mainWork:
        '20 minutos de entrada en calor en Z1–Z2. 3 bloques de 10 min en Z4 con 5 min suaves entre cada uno. 30 min de vuelta a la calma en Z1.',
    })
    expect(text.match(/entrada en calor/gi)).toHaveLength(1)
    expect(text.match(/vuelta a la calma/gi)).toHaveLength(1)
    expect(text).toMatch(/3 bloques de 10 min/)
  })
})

describe('dedupeWarmupCooldownProse', () => {
  it('keeps the coach entrada/vuelta when the app wrapped them again', () => {
    const text = dedupeWarmupCooldownProse(
      '15 min de entrada en calor progresiva en Z1–Z2. 20 minutos de entrada en calor en Z1–Z2. 3 bloques de 10 min alternando Over y Under. 30 min de vuelta a la calma en Z1. 10 min de vuelta a la calma en Z1. El tiempo total (90 min) incluye entrada y vuelta.'
    )
    expect(text).toMatch(/20 minutos de entrada/)
    expect(text).toMatch(/30 min de vuelta/)
    expect(text).not.toMatch(/15 min de entrada/)
    expect(text).not.toMatch(/10 min de vuelta/)
    expect(text.match(/entrada en calor/gi)).toHaveLength(1)
    expect(text.match(/vuelta a la calma/gi)).toHaveLength(1)
  })
})

describe('buildBikeSessionDescription', () => {
  it('keeps a complete coach prescription even if the title has 3x10m', () => {
    const text = buildBikeSessionDescription({
      kind: 'threshold',
      minutes: 90,
      zone: 'Z4',
      title: 'Bici Over-Unders 3×10m',
      rawDescription:
        '20 minutos de entrada en calor en Z1–Z2. 3 bloques de 10 min alternando 1 min Over (Z4) × 1 min Under (Z3) con 5 minutos de recuperación en Z1 entre series. 30 min de vuelta a la calma en Z1.',
      templateMainWork: 'Ritmo constante en Z2',
    })
    expect(text).toMatch(/20 minutos de entrada/)
    expect(text).toMatch(/30 min de vuelta/)
    expect(text.match(/entrada/gi)).toHaveLength(1)
    expect(text.match(/vuelta a la calma/gi)).toHaveLength(1)
    expect(text).not.toMatch(/15 min de entrada/)
  })
})

describe('commitSessionDescription', () => {
  it('persists the coach description instead of wrapping it with template blocks', () => {
    const coach =
      '4x5 min en Z4 recuperando 3 min a 90 rpm. Terreno llano. Sin vueltas extra de Z2.'
    const text = commitSessionDescription({
      kind: 'threshold',
      minutes: 75,
      zone: 'Z4',
      title: 'Bici 4x5 Z4',
      rawDescription: coach,
      templateMainWork: 'Ritmo constante en Z2',
    })
    expect(text).toBe(coach)
    expect(text).not.toMatch(/entrada en calor/)
    expect(text).not.toMatch(/Ritmo constante en Z2/)
  })
})
