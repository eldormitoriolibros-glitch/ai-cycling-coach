import { describe, expect, it } from 'vitest'
import { parseReviewDate, wantsSessionReview } from '@/lib/coach/review-intent'

describe('review intent', () => {
  it('detects an explicit ask and ignores nearby chat', () => {
    expect(wantsSessionReview('/devolucion')).toBe(true)
    expect(wantsSessionReview('/devolución ayer')).toBe(true)
    expect(wantsSessionReview('dame la devolución de ayer')).toBe(true)
    expect(wantsSessionReview('¿cómo me fue el domingo?')).toBe(true)
    expect(wantsSessionReview('revisá la sesión de hoy')).toBe(true)
    expect(wantsSessionReview('pasá el umbral al jueves')).toBe(false)
    expect(wantsSessionReview('no me mandes más mensajes')).toBe(false)
    expect(wantsSessionReview('¿qué entreno hoy?')).toBe(false)
  })

  it('reads a day hint relative to today', () => {
    expect(parseReviewDate('dame la devolución', '2026-09-12')).toBeNull()
    expect(parseReviewDate('cómo me fue hoy', '2026-09-12')).toBe('2026-09-12')
    expect(parseReviewDate('/devolucion ayer', '2026-09-12')).toBe('2026-09-11')
    expect(parseReviewDate('la de anteayer', '2026-09-12')).toBe('2026-09-10')
    expect(parseReviewDate('devolución del 2026-09-07', '2026-09-12')).toBe('2026-09-07')
    expect(parseReviewDate('cómo me fue el domingo', '2026-09-12')).toBe('2026-09-06')
    expect(parseReviewDate('el sábado', '2026-09-12')).toBe('2026-09-12')
  })
})
