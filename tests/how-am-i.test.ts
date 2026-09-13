import { describe, expect, it } from 'vitest'
import { describeHowAmI, todayPlanState } from '@/lib/training/how-am-i'
import type { MetricAssessment } from '@/lib/training/form-status'
import type { ReadinessResult } from '@/lib/training/readiness'

const form: MetricAssessment = {
  id: 'form',
  label: 'Forma',
  value: 5,
  position: 0.5,
  band: 'normal',
  bandLabel: 'Equilibrado',
  hint: 'TSB en rango.',
  ticks: [],
}

describe('how am I', () => {
  it('names readiness and keeps flags precise', () => {
    const readiness: ReadinessResult = {
      score: 74,
      label: 'Margen para trabajo de calidad',
      flags: ['sueño corto'],
      dataSources: ['declarado'],
    }
    const line = describeHowAmI(readiness, form)
    expect(line.headline).toBe('Readiness 74/100: margen para trabajo de calidad.')
    expect(line.tone).toBe('good')
    expect(line.support).toMatch(/TSB \+5/)
    expect(line.support).toMatch(/sueño < 6 h/)
  })

  it('changes the implication after the session is done', () => {
    const readiness: ReadinessResult = {
      score: 58,
      label: 'Adecuado para lo prescripto, sin sumar intensidad',
      flags: [],
      dataSources: ['garmin'],
    }
    expect(describeHowAmI(readiness, form).headline).toBe(
      'Readiness 58/100: adecuado para lo prescripto, sin sumar intensidad.'
    )
    expect(describeHowAmI(readiness, form, 'done').headline).toBe(
      'Sesión cumplida. Readiness 58/100: recuperación intermedia.'
    )
  })

  it('falls back to TSB when there is only load', () => {
    const readiness: ReadinessResult = {
      score: 60,
      label: 'Adecuado para lo prescripto, sin sumar intensidad (basado solo en carga)',
      flags: [],
      dataSources: ['carga'],
    }
    const line = describeHowAmI(readiness, form)
    expect(line.headline).toBe('TSB +5 (equilibrado): la sesión prescripta es adecuada.')
    expect(line.support).toMatch(/sin sueño/)
    expect(line.tone).toBe('ok')
  })

  it('treats completed or skipped sessions as a finished day', () => {
    expect(todayPlanState([])).toBe('none')
    expect(todayPlanState([{ status: 'scheduled' }])).toBe('pending')
    expect(todayPlanState([{ status: 'completed' }, { status: 'skipped' }])).toBe('done')
  })
})
