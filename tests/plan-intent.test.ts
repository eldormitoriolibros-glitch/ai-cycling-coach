import { describe, expect, it } from 'vitest'
import { isPlanConfirm, wantsPlanWrite } from '@/lib/training/plan-intent'
import { addDays, formatWeekRange, startOfWeek } from '@/lib/training/dates'

describe('plan intent', () => {
  it('only confirmations persist a proposed change', () => {
    expect(isPlanConfirm('sí')).toBe(true)
    expect(isPlanConfirm('si, quiero agendarla')).toBe(true)
    expect(isPlanConfirm('dale')).toBe(true)
    expect(isPlanConfirm('confirmá el cambio')).toBe(true)
    expect(isPlanConfirm('pasá el umbral al jueves')).toBe(false)
    expect(isPlanConfirm('armame un plan para los próximos 7 días')).toBe(false)
  })

  it('detects schedule and change requests without treating them as confirm', () => {
    expect(wantsPlanWrite('pasá el umbral al jueves')).toBe(true)
    expect(wantsPlanWrite('armame un plan para los próximos 7 días')).toBe(true)
    expect(wantsPlanWrite('sacá la fuerza de hoy')).toBe(true)
    expect(isPlanConfirm('pasá el umbral al jueves')).toBe(false)
  })

  it('does not treat a simple question as a write', () => {
    expect(wantsPlanWrite('¿qué debería entrenar hoy?')).toBe(false)
    expect(wantsPlanWrite('cómo viene mi carga esta semana')).toBe(false)
  })
})

describe('week range', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-09-08')).toBe('2026-09-07')
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31')
    expect(addDays(startOfWeek('2026-09-08'), 6)).toBe('2026-09-13')
  })

  it('formats a week range', () => {
    expect(formatWeekRange('2026-09-07', '2026-09-13')).toMatch(/7/)
  })
})
