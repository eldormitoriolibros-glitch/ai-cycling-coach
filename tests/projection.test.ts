import { describe, it, expect } from 'vitest'
import { projectLoad } from '@/lib/training/projection'

describe('projection', () => {
  it('projects forward with zero load (rest)', () => {
    const last = { date: new Date().toISOString().slice(0,10), daily_load: 50, chronic_load: 50, acute_load: 30, form: 20 }
    const points = projectLoad(last as any, 3, [0,0,0])
    expect(points.length).toBe(3)
    // form should trend toward positive as acute decays faster than chronic
    expect(typeof points[0].chronic_load).toBe('number')
    expect(typeof points[0].acute_load).toBe('number')
  })
})

