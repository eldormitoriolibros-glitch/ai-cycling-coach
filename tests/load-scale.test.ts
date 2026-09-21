import { describe, expect, it } from 'vitest'
import { buildLoadScale, loadLevel } from '@/lib/training/load-scale'

describe('buildLoadScale', () => {
  it('returns empty when nobody trained', () => {
    expect(buildLoadScale([0, 0, 0])).toEqual([])
  })

  it('cuts the athlete’s own distribution', () => {
    const loads = Array.from({ length: 20 }, (_, i) => (i + 1) * 10)
    const scale = buildLoadScale(loads)
    expect(scale).toHaveLength(4)
    expect(scale[0]).toBeLessThan(scale[3])
  })
})

describe('loadLevel', () => {
  const scale = [20, 45, 70, 90]

  it('stays empty without load', () => {
    expect(loadLevel(0, scale)).toBe(0)
    expect(loadLevel(40, [])).toBe(0)
  })

  it('steps through the same five trained buckets as the heatmap', () => {
    expect(loadLevel(10, scale)).toBe(1)
    expect(loadLevel(20, scale)).toBe(1)
    expect(loadLevel(21, scale)).toBe(2)
    expect(loadLevel(70, scale)).toBe(3)
    expect(loadLevel(91, scale)).toBe(5)
  })
})
