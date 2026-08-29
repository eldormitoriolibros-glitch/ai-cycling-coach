import { describe, expect, it } from 'vitest'
import { formatCycleHistory, mondayOf, type LoadPoint, type CycleActivity } from '@/lib/coach/execution'

function loadDay(date: string, daily: number): LoadPoint {
  return { date, daily_load: daily, chronic_load: 50, acute_load: 55, form: -5, ramp_rate: 1 }
}

function ride(start: string, km: number, load: number): CycleActivity {
  return {
    start_time: `${start}T12:00:00-03:00`,
    distance_meters: km * 1000,
    moving_seconds: 7200,
    duration_seconds: 7200,
    training_load: load,
  }
}

describe('mondayOf', () => {
  it('snaps Sunday back to the previous Monday', () => {
    expect(mondayOf('2026-08-30')).toBe('2026-08-24')
  })

  it('keeps Monday as Monday', () => {
    expect(mondayOf('2026-08-24')).toBe('2026-08-24')
  })
})

describe('formatCycleHistory', () => {
  it('flags a rest week after three loading weeks', () => {
    const load: LoadPoint[] = []
    const activities: CycleActivity[] = []

    // Four weeks: 24/31 Jul, 7/14 Aug — high, high, high, then light
    const weeks = [
      { monday: '2026-08-03', daily: 80 },
      { monday: '2026-08-10', daily: 90 },
      { monday: '2026-08-17', daily: 100 },
      { monday: '2026-08-24', daily: 30 },
    ]
    for (const w of weeks) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(`${w.monday}T00:00:00Z`)
        date.setUTCDate(date.getUTCDate() + d)
        const key = date.toISOString().slice(0, 10)
        load.push(loadDay(key, w.daily))
      }
      activities.push(ride(w.monday, 80, w.daily * 7))
    }

    const lines = formatCycleHistory(load, activities, 'UTC', '2026-08-29')
    const joined = lines.join('\n')

    expect(lines[0]).toBe('## Ciclos (12 semanas, lun–dom)')
    expect(joined).toContain('liviana')
    expect(joined).toMatch(/semanas de carga seguidas/)
    expect(joined).toMatch(/sugerencia:/)
  })

  it('returns a fallback when there is no history', () => {
    expect(formatCycleHistory([], [], 'UTC', '2026-08-29')).toEqual([
      'sin datos suficientes para armar ciclos',
    ])
  })
})
