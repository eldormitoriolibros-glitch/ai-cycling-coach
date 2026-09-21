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
  })

  it('turns a listed circuit into specific rows with the stated scheme', () => {
    const rows = strengthExercises('Circuito de sentadillas, fondos y plancha 3x12')
    expect(rows.map((r) => r.exercise)).toEqual([
      'Movilidad de entrada',
      'Sentadillas',
      'Fondos',
      'Plancha',
      'Vuelta: movilidad suave',
    ])
    expect(rows.find((r) => r.exercise === 'Sentadillas')).toMatchObject({ sets: '3', reps: '12' })
  })

  it('keeps each exercise’s own sets, and treats 45s as seconds', () => {
    const rows = strengthExercises(
      'Movilidad articular 5 min. 3×45s plancha frontal, 3×10 perro de caza (bird-dog), 3×10 plancha lateral por lado. Cierre 5 min estiramiento.',
      'Fuerza core y movilidad'
    )
    expect(rows.map((r) => r.exercise)).toEqual([
      'Movilidad articular',
      'Plancha frontal',
      'Perro de caza (bird-dog)',
      'Plancha lateral',
      'Cierre',
    ])
    expect(rows.find((r) => r.exercise === 'Plancha frontal')).toMatchObject({ sets: '3', reps: '45 s' })
    expect(rows.find((r) => r.exercise === 'Perro de caza (bird-dog)')).toMatchObject({ sets: '3', reps: '10' })
    expect(rows.find((r) => r.exercise === 'Plancha lateral')).toMatchObject({ sets: '3', reps: '10 / lado' })
    expect(rows.find((r) => r.exercise === 'Movilidad articular')).toMatchObject({ sets: '1', reps: '5 min' })
  })

  it('does not paint the first scheme onto every later exercise', () => {
    const rows = strengthExercises(
      'Movilidad articular 5 min. 3×12 puente de glúteo, 3×10 perro de caza (bird-dog), 3×10 plancha lateral por lado. Cierre 5 min.',
      'Core y movilidad'
    )
    expect(rows.find((r) => r.exercise === 'Puente de glúteo')).toMatchObject({ sets: '3', reps: '12' })
    expect(rows.find((r) => r.exercise === 'Perro de caza (bird-dog)')).toMatchObject({ sets: '3', reps: '10' })
    expect(rows.some((r) => r.exercise === 'Core')).toBe(false)
  })

  it('uses an upper-body table when the session is torso/core, not the leg template', () => {
    const rows = strengthExercises(
      'Rutina de torso y zona media: remos con banda/mancuerna, empujes, spinales y core anti-rotación.',
      'Fuerza superior y core'
    )
    expect(rows.map((r) => r.exercise)).toEqual([
      'Movilidad de entrada',
      'Remos con banda/mancuerna',
      'Empujes',
      'Spinales',
      'Core anti-rotación',
      'Vuelta: movilidad suave',
    ])
    expect(rows.some((r) => /sentadilla|peso muerto/i.test(r.exercise))).toBe(false)
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

  it('keeps Z4 spikes and the Z2 continuous block from the same prescription', () => {
    const blocks = blocksForBikeSession({
      title: 'Bici con chispazos',
      description:
        '15 min de entrada en calor Z1-Z2. 3 pasadas de 1 min en Z4 a cadencia alta (>100 rpm) recuperando 3 min en Z1 entre cada una. 33 min continuos en Z2 suave. 10 min de vuelta a la calma en Z1.',
      minutes: 60,
      zone: 'Z2',
      kind: 'endurance',
    })
    expect(blocks.find((b) => b.label === 'Entrada en calor')).toMatchObject({ minutes: 15, intensity: 'Z1-Z2' })
    expect(blocks.find((b) => b.label === 'Intervalos')).toMatchObject({
      repeats: 3,
      minutes: 1,
      intensity: 'Z4',
    })
    expect(blocks.find((b) => b.label === 'Recuperación entre series')).toMatchObject({
      minutes: 3,
      intensity: 'Z1',
    })
    expect(blocks.find((b) => b.label === 'Bloque principal')).toMatchObject({
      minutes: 33,
      intensity: 'Z2',
    })
    expect(blocks.find((b) => b.label === 'Vuelta a la calma')).toMatchObject({ minutes: 10, intensity: 'Z1' })
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

describe('group ride plan', () => {
  it('keeps only duration and three basic blocks, ignoring a written interval plan', () => {
    const blocks = blocksForBikeSession({
      title: 'Salida grupal de intensidad',
      description:
        '20 min de entrada en calor en Z1. 75 min de trabajo de intensidad en grupeta con relevos y cambios de ritmo (Z3-Z5). 10 min de lavado de piernas. 15 min de vuelta a la calma en Z1.',
      minutes: 120,
      zone: 'Z4',
      kind: 'vo2max',
    })
    expect(blocks.map((b) => b.label)).toEqual(['Entrada en calor', 'Rodada', 'Vuelta a la calma'])
    expect(blocks.reduce((sum, b) => sum + (b.minutes ?? 0), 0)).toBe(120)
    expect(blocks[1]).toMatchObject({ intensity: 'grupeta' })
  })

  it('persists a short grupeta description instead of the coach interval prose', () => {
    const text = commitSessionDescription({
      kind: 'threshold',
      minutes: 120,
      zone: 'Z4',
      title: 'Salida grupal de intensidad',
      rawDescription: '75 min de trabajo de intensidad en grupeta con relevos (Z3-Z5).',
      templateMainWork: 'Ritmo constante en Z2',
    })
    expect(text).toMatch(/rodada en grupeta/)
    expect(text).not.toMatch(/relevos/)
    expect(text).not.toMatch(/Z3/)
  })

  it('keeps a written group-ride workout instead of flattening it', () => {
    const blocks = blocksForBikeSession({
      title: 'Salida grupal + 4x5m Z4',
      description: '15 min de entrada. 4 bloques de 5 min en Z4 con 3 min suaves. 10 min de vuelta.',
      minutes: 90,
      zone: 'Z4',
      kind: 'threshold',
    })
    expect(blocks.some((b) => b.label === 'Intervalos')).toBe(true)
    expect(blocks.find((b) => b.label === 'Intervalos')).toMatchObject({
      repeats: 4,
      minutes: 5,
    })

    const text = commitSessionDescription({
      kind: 'threshold',
      minutes: 90,
      zone: 'Z4',
      title: 'Salida grupal + 4x5m Z4',
      rawDescription: '4 bloques de 5 min en Z4 con 3 min suaves entre cada uno.',
      templateMainWork: 'Ritmo constante en Z2',
    })
    expect(text).toMatch(/4 bloques de 5 min/)
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
