import { describe, expect, it } from 'vitest'
import {
  balanceNote,
  decodeLeftPercent,
  formatPedalMetrics,
  pedalDetailItems,
  pedalFromFit,
  pedalFromGarminList,
  phaseArcPath,
  phaseSpanDegrees,
  summarizePedalTrend,
} from '@/lib/garmin/pedal-metrics'

describe('decodeLeftPercent', () => {
  it('decodes the FIT right-side flag (0x80 | 52 = 52% right)', () => {
    expect(decodeLeftPercent(0x80 | 52)).toBe(48)
  })

  it('reads an explicit left/right pair from Garmin Connect', () => {
    expect(decodeLeftPercent('47/53')).toBe(47)
  })
})

describe('pedalFromGarminList', () => {
  it('maps Connect balance and TE aliases', () => {
    expect(
      pedalFromGarminList({
        leftBalance: 47.4,
        rightBalance: 52.6,
        leftTorqueEffectiveness: 71,
        rightTorqueEffectiveness: 78,
        leftPedalSmoothness: 21,
        rightPedalSmoothness: 24,
      })
    ).toMatchObject({
      leftPct: 47.4,
      rightPct: 52.6,
      leftTe: 71,
      rightTe: 78,
      leftSmooth: 21,
      rightSmooth: 24,
    })
  })
})

describe('pedalFromFit', () => {
  it('prefers session averages and fills the missing side', () => {
    const metrics = pedalFromFit(
      { left_right_balance: 0x80 | 54, avg_left_torque_effectiveness: 70 },
      []
    )
    expect(metrics).toMatchObject({ leftPct: 46, rightPct: 54, leftTe: 70 })
  })
})

describe('summarizePedalTrend', () => {
  it('flags a stable right-side dominance for unilateral strength', () => {
    const lines = summarizePedalTrend([
      { date: '2026-09-20', metrics: { ...empty(), leftPct: 46, rightPct: 54 } },
      { date: '2026-09-19', metrics: { ...empty(), leftPct: 47, rightPct: 53 } },
      { date: '2026-09-18', metrics: { ...empty(), leftPct: 46, rightPct: 54 } },
    ])
    expect(lines.join(' ')).toMatch(/izquierda/)
    expect(lines.join(' ')).toMatch(/unilateral/)
  })

  it('splits coach-facing pedaling fields', () => {
    expect(
      pedalDetailItems({
        ...empty(),
        leftPct: 47,
        rightPct: 53,
        leftTe: 71,
        rightTe: 78,
      })
    ).toEqual([
      { label: 'Balance I / D', value: '47 / 53 %' },
      { label: 'Efectividad I / D', value: '71 / 78 %' },
    ])
  })

  it('measures a wrapping power phase', () => {
    expect(phaseSpanDegrees(356, 204)).toBe(208)
    expect(phaseSpanDegrees(0, 201)).toBe(201)
    expect(phaseArcPath(40, 40, 28, 0, 201)).toMatch(/^M /)
  })

  it('explains a left-heavy balance in one line', () => {
    expect(balanceNote(55)).toBe('La izquierda aporta 5 puntos más.')
    expect(balanceNote(50.4)).toBe('Cerca de 50/50.')
  })

  it('formats a compact pedaling line', () => {
    expect(
      formatPedalMetrics({
        ...empty(),
        leftPct: 47,
        rightPct: 53,
        leftTe: 71,
        rightTe: 78,
      })
    ).toBe('I 47 / D 53 · TE 71 / 78')
  })
})

function empty() {
  return {
    leftPct: null,
    rightPct: null,
    leftTe: null,
    rightTe: null,
    leftSmooth: null,
    rightSmooth: null,
    leftPhaseStart: null,
    leftPhaseEnd: null,
    rightPhaseStart: null,
    rightPhaseEnd: null,
  }
}
