import type { BandId, MetricAssessment } from './form-status'
import type { ReadinessResult } from './readiness'

export type HowAmITone = 'good' | 'ok' | 'low' | 'rest' | 'empty'

export type HowAmI = {
  headline: string
  support: string | null
  tone: HowAmITone
}

export type TodayPlanState = 'none' | 'pending' | 'done'

const FLAG_COPY: Record<string, string> = {
  'sueño corto': 'sueño < 6 h',
  'FC reposo elevada': 'FC reposo >10% sobre la basal',
  'HRV baja': 'HRV < 85% de la basal',
  'dolor alto': 'soreness ≥ 7/10',
  'forma muy negativa': 'TSB < −25',
  'estrés alto': 'estrés promedio > 50',
  'Body Battery baja': 'Body Battery < 25',
}

const FORM_BAND: Record<BandId, string> = {
  very_high: 'muy fresco',
  high: 'fresco',
  normal: 'equilibrado',
  low: 'cargado',
  very_low: 'muy fatigado',
}

function toneFromScore(score: number): Exclude<HowAmITone, 'empty'> {
  if (score >= 70) return 'good'
  if (score >= 50) return 'ok'
  if (score >= 35) return 'low'
  return 'rest'
}

function toneFromForm(band: MetricAssessment['band']): HowAmITone {
  if (band === 'very_high' || band === 'high') return 'good'
  if (band === 'normal') return 'ok'
  if (band === 'low') return 'low'
  if (band === 'very_low') return 'rest'
  return 'empty'
}

function formatTsb(form: MetricAssessment | null): string | null {
  if (form?.value == null) return null
  const n = Math.round(form.value)
  return `TSB ${n > 0 ? `+${n}` : n}`
}

function formatFlags(flags: string[]): string | null {
  if (!flags.length) return null
  return flags.map((flag) => FLAG_COPY[flag] ?? flag).join(' · ')
}

function joinSupport(parts: Array<string | null>): string | null {
  const text = parts.filter(Boolean).join(' · ')
  return text || null
}

function readinessLine(score: number, tone: Exclude<HowAmITone, 'empty'>, plan: TodayPlanState): string {
  const metric = `Readiness ${score}/100`
  const implication: Record<Exclude<HowAmITone, 'empty'>, string> = {
    good: 'margen para trabajo de calidad',
    ok: 'adecuado para lo prescripto, sin sumar intensidad',
    low: 'fatiga elevada; reducir intensidad',
    rest: 'fatiga alta; descanso o Z1',
  }

  if (plan === 'done') {
    const after: Record<Exclude<HowAmITone, 'empty'>, string> = {
      good: 'recuperación favorable',
      ok: 'recuperación intermedia',
      low: 'queda fatiga residual',
      rest: 'recuperación insuficiente',
    }
    return `Sesión cumplida. ${metric}: ${after[tone]}.`
  }
  if (plan === 'none') {
    return `Sin sesión hoy. ${metric}: ${implication[tone]}.`
  }
  return `${metric}: ${implication[tone]}.`
}

function formLine(band: BandId, tsb: number, plan: TodayPlanState): string {
  const state = `TSB ${tsb > 0 ? `+${tsb}` : tsb} (${FORM_BAND[band]})`
  if (plan === 'done') return `Sesión cumplida. ${state}.`
  if (plan === 'none') return `Sin sesión hoy. ${state}.`
  if (band === 'very_low') return `${state}: priorizar Z1 o descanso.`
  if (band === 'low') return `${state}: cumplir lo prescripto, sin extras.`
  if (band === 'normal') return `${state}: la sesión prescripta es adecuada.`
  return `${state}: hay margen para calidad.`
}

export function todayPlanState(sessions: { status?: string | null }[]): TodayPlanState {
  if (!sessions.length) return 'none'
  const pending = sessions.some((s) => s.status !== 'completed' && s.status !== 'skipped')
  return pending ? 'pending' : 'done'
}

/**
 * Home status line: named metric + number + implication.
 * After the day's sessions are closed, it reports recovery, not what to ride.
 */
export function describeHowAmI(
  readiness: ReadinessResult,
  form: MetricAssessment | null,
  plan: TodayPlanState = 'pending'
): HowAmI {
  const sources = readiness.dataSources
  const hasRecovery = sources.some((s) => s === 'garmin' || s === 'declarado')
  const onlyLoad = sources.length === 1 && sources[0] === 'carga'
  const empty = sources[0] === 'sin datos'
  const tsb = formatTsb(form)

  if (hasRecovery) {
    const tone = toneFromScore(readiness.score)
    return {
      headline: readinessLine(readiness.score, tone, plan),
      support: joinSupport([tsb, formatFlags(readiness.flags)]),
      tone,
    }
  }

  if ((onlyLoad || empty) && form?.band && form.value != null) {
    return {
      headline: formLine(form.band, Math.round(form.value), plan),
      support: 'Calculado solo con la carga de las salidas (sin sueño ni HRV de hoy).',
      tone: toneFromForm(form.band),
    }
  }

  return {
    headline: 'Sin datos suficientes de recuperación ni de carga.',
    support: 'Hace falta una salida sincronizada o el check-in de la mañana.',
    tone: 'empty',
  }
}
