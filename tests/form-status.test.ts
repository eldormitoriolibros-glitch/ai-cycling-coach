import { describe, expect, it } from 'vitest'
import {
  assessFatigue,
  assessFitness,
  assessForm,
  assessFormStatus,
  assessRamp,
  positionInRange,
} from '@/lib/training/form-status'

describe('positionInRange', () => {
  it('clamps to 0–1', () => {
    expect(positionInRange(-100, -40, 30)).toBe(0)
    expect(positionInRange(100, -40, 30)).toBe(1)
    expect(positionInRange(-5, -40, 30)).toBeCloseTo((-5 - -40) / 70)
  })
})

describe('assessForm', () => {
  it('flags very fatigued TSB', () => {
    const a = assessForm(-35)
    expect(a.band).toBe('very_low')
    expect(a.bandLabel).toMatch(/fatigado/i)
  })

  it('flags balanced and fresh bands', () => {
    expect(assessForm(0).band).toBe('normal')
    expect(assessForm(10).band).toBe('high')
    expect(assessForm(25).band).toBe('very_high')
  })
})

describe('assessRamp', () => {
  it('flags aggressive ramp', () => {
    expect(assessRamp(10).band).toBe('very_high')
    expect(assessRamp(2).band).toBe('normal')
    expect(assessRamp(-6).band).toBe('very_low')
  })
})

describe('assessFatigue', () => {
  it('uses ATL/CTL ratio', () => {
    expect(assessFatigue(50, 100).band).toBe('very_low')
    expect(assessFatigue(105, 100).band).toBe('normal')
    expect(assessFatigue(140, 100).band).toBe('very_high')
  })
})

describe('assessFitness', () => {
  it('places CTL in personal history', () => {
    const history = [40, 42, 45, 48, 50, 52, 55, 58, 60, 62]
    const low = assessFitness(41, history)
    const mid = assessFitness(51, history)
    const high = assessFitness(61, history)
    expect(low.band).toBe('very_low')
    expect(mid.band).toBe('normal')
    expect(high.band).toBe('very_high')
  })

  it('handles thin history', () => {
    const a = assessFitness(50, [48, 49])
    expect(a.band).toBe('normal')
    expect(a.bandLabel).toMatch(/historial/i)
  })
})

describe('assessFormStatus', () => {
  it('builds a full status object', () => {
    const status = assessFormStatus({
      form: -8,
      chronicLoad: 55,
      acuteLoad: 60,
      rampRate: 3,
      ctlHistory: Array.from({ length: 20 }, (_, i) => 40 + i),
    })
    expect(status.form.band).toBe('normal')
    expect(status.summary.length).toBeGreaterThan(0)
    expect(status.fitness.position).not.toBeNull()
  })
})
