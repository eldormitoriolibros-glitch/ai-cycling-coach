import { describe, expect, it } from 'vitest'
import { analyzeLapShape, classifyLaps, formatLapsForCoach, type ActivityLapRow } from '@/lib/activities/laps'

function lap(overrides: Partial<ActivityLapRow> & { lap_index: number }): ActivityLapRow {
  return {
    start_offset_seconds: 0,
    elapsed_seconds: 240,
    moving_seconds: 240,
    distance_meters: 2000,
    avg_speed: null,
    max_speed: null,
    avg_hr: 160,
    max_hr: 168,
    avg_cadence: 90,
    max_cadence: null,
    avg_power: 260,
    max_power: 280,
    normalized_power: 262,
    elevation_gain_meters: null,
    calories: null,
    lap_trigger: 'manual',
    intensity: 'active',
    ...overrides,
  }
}

describe('analyzeLapShape', () => {
  it('detects a power fade from first half to second half', () => {
    const samples = [
      ...Array.from({ length: 120 }, (_, i) => ({ offset_seconds: i, power: 280, heart_rate: 150 })),
      ...Array.from({ length: 120 }, (_, i) => ({ offset_seconds: 120 + i, power: 240, heart_rate: 162 })),
    ]

    const shape = analyzeLapShape(lap({ lap_index: 1 }), samples)
    expect(shape?.fadePct).toBe(-14)
    expect(shape?.hrDrift).toBe(12)
  })

  it('returns null when the block is too short', () => {
    expect(
      analyzeLapShape(lap({ lap_index: 1, moving_seconds: 20, elapsed_seconds: 20 }), [
        { offset_seconds: 0, power: 300, heart_rate: 160 },
      ])
    ).toBeNull()
  })
})

describe('formatLapsForCoach', () => {
  it('adds fade text on work laps when samples exist', () => {
    const laps = [
      lap({ lap_index: 1, intensity: 'active', avg_power: 260 }),
      lap({ lap_index: 2, intensity: 'rest', avg_power: 140, start_offset_seconds: 240 }),
    ]
    const samples = [
      ...Array.from({ length: 120 }, (_, i) => ({ offset_seconds: i, power: 280, heart_rate: 150 })),
      ...Array.from({ length: 120 }, (_, i) => ({ offset_seconds: 120 + i, power: 240, heart_rate: 162 })),
    ]

    const lines = formatLapsForCoach(laps, samples)
    expect(lines[0]).toContain('cae 14%')
    expect(lines[0]).toContain('pulso +12 ppm')
    expect(lines[1]).not.toContain('cae')
  })
})

describe('classifyLaps', () => {
  it('treats over-under minutes as work and only clearly easy laps as rest', () => {
    const laps = [
      lap({ lap_index: 1, intensity: null, avg_power: null, avg_hr: 167, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 2, intensity: null, avg_power: null, avg_hr: 147, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 3, intensity: null, avg_power: null, avg_hr: 168, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 4, intensity: null, avg_power: null, avg_hr: 146, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 5, intensity: null, avg_power: null, avg_hr: 120, moving_seconds: 240, elapsed_seconds: 240 }),
    ]
    const classified = classifyLaps(laps)
    expect(classified.map((l) => l.effort)).toEqual(['work', 'work', 'work', 'work', 'rest'])
  })

  it('does not label a delayed-HR over as recovery just because it sits near the median', () => {
    const laps = [
      lap({ lap_index: 1, intensity: null, avg_power: null, avg_hr: 167, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 2, intensity: null, avg_power: null, avg_hr: 147, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 3, intensity: null, avg_power: null, avg_hr: 155, moving_seconds: 60, elapsed_seconds: 60 }),
      lap({ lap_index: 4, intensity: null, avg_power: null, avg_hr: 118, moving_seconds: 240, elapsed_seconds: 240 }),
    ]
    expect(classifyLaps(laps)[2].effort).toBe('work')
  })
})
