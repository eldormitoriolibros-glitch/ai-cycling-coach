import { describe, expect, it } from 'vitest'
import { parseWorkoutBlocks, strengthExercises, formatBikeDescription, blocksForBikeSession } from '@/lib/training/workout-blocks'

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
})
