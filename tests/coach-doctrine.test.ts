import { describe, expect, it } from 'vitest'
import {
  COACH_DOCTRINE,
  COACH_DOCTRINE_REVIEW,
  suggestIntensityDistribution,
} from '@/lib/coach/doctrine'
import { composeCoachSystemPrompt, composeReviewSystemPrompt } from '@/lib/coach/system-prompt'

const RULES = 'Reglas que no podés romper:\n1. Usá SOLO los datos del contexto.'
const CONTEXT = '## Disponibilidad semanal\ntecho bici: 7.5 h/sem → distribución: pirámide'

describe('composeCoachSystemPrompt', () => {
  it('keeps rules, then doctrine, then athlete context', () => {
    const prompt = composeCoachSystemPrompt({
      rules: RULES,
      doctrine: COACH_DOCTRINE,
      athleteContext: CONTEXT,
      channel: 'web',
    })
    const rulesAt = prompt.indexOf('Reglas que no podés romper')
    const doctrineAt = prompt.indexOf('# Doctrina')
    const contextAt = prompt.indexOf('# Contexto del atleta')
    expect(rulesAt).toBeGreaterThanOrEqual(0)
    expect(doctrineAt).toBeGreaterThan(rulesAt)
    expect(contextAt).toBeGreaterThan(doctrineAt)
    expect(prompt).not.toMatch(/Telegram/)
  })

  it('adds the Telegram constraint only on that channel', () => {
    const prompt = composeCoachSystemPrompt({
      rules: RULES,
      doctrine: COACH_DOCTRINE,
      athleteContext: CONTEXT,
      channel: 'telegram',
    })
    const telegramAt = prompt.indexOf('Estás respondiendo por Telegram')
    const contextAt = prompt.indexOf('# Contexto del atleta')
    expect(telegramAt).toBeGreaterThan(prompt.indexOf('# Doctrina'))
    expect(contextAt).toBeGreaterThan(telegramAt)
  })

  it('does not leave a lone doctrine heading when doctrine is empty', () => {
    const prompt = composeCoachSystemPrompt({
      rules: RULES,
      doctrine: '',
      athleteContext: CONTEXT,
      channel: 'web',
    })
    expect(prompt).not.toMatch(/# Doctrina/)
    expect(prompt).toMatch(/# Contexto del atleta/)
  })
})

describe('suggestIntensityDistribution', () => {
  it('does not invent hours when availability is missing', () => {
    expect(suggestIntensityDistribution(null).id).toBe('unspecified')
    expect(suggestIntensityDistribution(0).id).toBe('unspecified')
    expect(suggestIntensityDistribution(null).hint).toMatch(/sin techo/)
  })

  it('uses the 6 h and 10 h band edges', () => {
    expect(suggestIntensityDistribution(5.9 * 60).id).toBe('time_crunched')
    expect(suggestIntensityDistribution(6 * 60).id).toBe('pyramidal')
    expect(suggestIntensityDistribution(10 * 60).id).toBe('pyramidal')
    expect(suggestIntensityDistribution(10.1 * 60).id).toBe('polarized')
  })

  it('formats the context hint with hours and band', () => {
    expect(suggestIntensityDistribution(7.5 * 60).hint).toBe('techo bici: 7.5 h/sem → distribución: pirámide')
  })
})

describe('doctrine copy', () => {
  it('states the three availability bands and app constraints', () => {
    expect(COACH_DOCTRINE).toMatch(/polarizado/i)
    expect(COACH_DOCTRINE).toMatch(/pirámide/i)
    expect(COACH_DOCTRINE).toMatch(/3 semanas/)
    expect(COACH_DOCTRINE).toMatch(/descarga/)
    expect(COACH_DOCTRINE).toMatch(/dentro del tiempo total/i)
    expect(COACH_DOCTRINE).toMatch(/[Ss]in reloj/)
  })

  it('does not name third-party coaching brands or 7-zone scales', () => {
    expect(COACH_DOCTRINE).not.toMatch(/TrainingPeaks|WKO|INSCYD|Stryd|zonas 1–7|zonas 1-7/i)
    expect(COACH_DOCTRINE_REVIEW).not.toMatch(/TrainingPeaks|WKO|INSCYD/i)
  })

  it('stays inside the token budget', () => {
    expect(COACH_DOCTRINE.length).toBeLessThan(7000)
    expect(COACH_DOCTRINE_REVIEW.length).toBeLessThan(1500)
  })
})

describe('composeReviewSystemPrompt', () => {
  it('puts doctrine before the 12-line review format', () => {
    const reviewRules = 'máximo 12 líneas.\n2. Comparación concreta. bloque a bloque'
    const prompt = composeReviewSystemPrompt(COACH_DOCTRINE_REVIEW, reviewRules)
    expect(prompt.indexOf('No premies TSS')).toBeLessThan(prompt.indexOf('máximo 12 líneas'))
    expect(prompt).toMatch(/bloque a bloque/)
  })
})
