/**
 * Interprets Banister-style load metrics against typical cycling ranges,
 * plus a personal fitness window derived from recent CTL history.
 */

export type BandId = 'very_low' | 'low' | 'normal' | 'high' | 'very_high'

export type MetricAssessment = {
  id: 'form' | 'fitness' | 'fatigue' | 'ramp'
  label: string
  value: number | null
  /** 0–1 position on the continuum (null if no value). */
  position: number | null
  band: BandId | null
  bandLabel: string
  hint: string
  /** Continuum tick labels, left → right. */
  ticks: { at: number; label: string }[]
}

export type FormStatus = {
  form: MetricAssessment
  fitness: MetricAssessment
  fatigue: MetricAssessment
  ramp: MetricAssessment
  summary: string
}

/** Map a value onto [0,1] within [min, max], clamped. */
export function positionInRange(value: number, min: number, max: number): number {
  if (max <= min) return 0.5
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function bandFromThresholds(
  value: number,
  cuts: [number, number, number, number]
): BandId {
  if (value < cuts[0]) return 'very_low'
  if (value < cuts[1]) return 'low'
  if (value < cuts[2]) return 'normal'
  if (value < cuts[3]) return 'high'
  return 'very_high'
}

const FORM_LABELS: Record<BandId, string> = {
  very_low: 'Muy fatigado',
  low: 'Cargado',
  normal: 'Equilibrado',
  high: 'Fresco',
  very_high: 'Muy fresco',
}

const RAMP_LABELS: Record<BandId, string> = {
  very_low: 'Descarga fuerte',
  low: 'Bajando',
  normal: 'Estable',
  high: 'Subiendo',
  very_high: 'Rampa agresiva',
}

const FITNESS_LABELS: Record<BandId, string> = {
  very_low: 'Muy bajo (personal)',
  low: 'Por debajo',
  normal: 'En tu rango',
  high: 'Por arriba',
  very_high: 'Pico reciente',
}

const FATIGUE_LABELS: Record<BandId, string> = {
  very_low: 'Muy fresca',
  low: 'Baja',
  normal: 'Alineada',
  high: 'Alta',
  very_high: 'Muy alta',
}

/**
 * TSB continuum: −40 … +30 (typical cycling coaching bands).
 * Cuts: −30 / −10 / +5 / +20
 */
export function assessForm(tsb: number | null): MetricAssessment {
  const ticks = [
    { at: 0, label: '−40' },
    { at: positionInRange(-30, -40, 30), label: '−30' },
    { at: positionInRange(-10, -40, 30), label: '−10' },
    { at: positionInRange(5, -40, 30), label: '+5' },
    { at: positionInRange(20, -40, 30), label: '+20' },
    { at: 1, label: '+30' },
  ]
  if (tsb == null) {
    return {
      id: 'form',
      label: 'Forma (TSB)',
      value: null,
      position: null,
      band: null,
      bandLabel: 'Sin datos',
      hint: 'Necesitás más historia de carga.',
      ticks,
    }
  }
  const band = bandFromThresholds(tsb, [-30, -10, 5, 20])
  const hints: Record<BandId, string> = {
    very_low: 'Priorizá descanso o sesiones muy suaves.',
    low: 'Normal en semanas fuertes; cuidá el sueño.',
    normal: 'Podés seguir el plan con normalidad.',
    high: 'Buen momento para calidad o competir.',
    very_high: 'Muy descansado: ideal para carrera o volver a cargar.',
  }
  return {
    id: 'form',
    label: 'Forma (TSB)',
    value: tsb,
    position: positionInRange(tsb, -40, 30),
    band,
    bandLabel: FORM_LABELS[band],
    hint: hints[band],
    ticks,
  }
}

/**
 * Ramp = ΔCTL en 7 días. Productive build ≈ +3…+7; >+8 is aggressive.
 * Continuum: −10 … +12
 */
export function assessRamp(ramp: number | null): MetricAssessment {
  const ticks = [
    { at: 0, label: '−10' },
    { at: positionInRange(-5, -10, 12), label: '−5' },
    { at: positionInRange(0, -10, 12), label: '0' },
    { at: positionInRange(5, -10, 12), label: '+5' },
    { at: positionInRange(8, -10, 12), label: '+8' },
    { at: 1, label: '+12' },
  ]
  if (ramp == null) {
    return {
      id: 'ramp',
      label: 'Rampa 7d',
      value: null,
      position: null,
      band: null,
      bandLabel: 'Sin datos',
      hint: 'Falta una semana de historia.',
      ticks,
    }
  }
  const band = bandFromThresholds(ramp, [-5, 0, 5, 8])
  // Ramp is a trailing 7-day delta: it keeps falling for a few days after a
  // recovery week, so the wording describes the number instead of guessing why.
  const hints: Record<BandId, string> = {
    very_low: 'Fitness bajando rápido: la carga de estos 7 días quedó muy por debajo de la semana previa.',
    low: 'Fitness bajando: los últimos 7 días sumaron menos carga que los 7 anteriores.',
    normal: 'Cambio suave; sostenible.',
    high: 'Progresión productiva; controlá la fatiga.',
    very_high: 'Subida agresiva: riesgo de sobrecarga.',
  }
  return {
    id: 'ramp',
    label: 'Rampa 7d',
    value: ramp,
    position: positionInRange(ramp, -10, 12),
    band,
    bandLabel: RAMP_LABELS[band],
    hint: hints[band],
    ticks,
  }
}

/**
 * Fitness vs personal recent window (CTL min–max of history).
 * Falls back to a neutral mid position when history is thin.
 */
export function assessFitness(
  ctl: number | null,
  history: number[]
): MetricAssessment {
  const ticks = [
    { at: 0, label: 'Mín' },
    { at: 0.25, label: '' },
    { at: 0.5, label: 'Medio' },
    { at: 0.75, label: '' },
    { at: 1, label: 'Máx' },
  ]
  const valid = history.filter((v) => Number.isFinite(v))
  if (ctl == null || valid.length < 7) {
    return {
      id: 'fitness',
      label: 'Fitness (CTL)',
      value: ctl,
      position: ctl == null ? null : 0.5,
      band: ctl == null ? null : 'normal',
      bandLabel: ctl == null ? 'Sin datos' : 'Sin historial suficiente',
      hint: ctl == null ? 'Sin CTL todavía.' : 'Con más semanas se arma tu rango personal.',
      ticks,
    }
  }
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const position = positionInRange(ctl, min, max)
  // Bands by quartile of personal range
  const band = bandFromThresholds(position, [0.15, 0.35, 0.65, 0.85])
  const hints: Record<BandId, string> = {
    very_low: 'Fitness cerca del piso de tus últimas semanas.',
    low: 'Por debajo de tu media reciente.',
    normal: 'Dentro de tu rango habitual de fitness.',
    high: 'Por encima de tu media reciente.',
    very_high: 'Cerca del pico de fitness reciente.',
  }
  return {
    id: 'fitness',
    label: 'Fitness (CTL)',
    value: ctl,
    position,
    band,
    bandLabel: FITNESS_LABELS[band],
    hint: `${hints[band]} (rango personal ≈ ${Math.round(min)}–${Math.round(max)}).`,
    ticks,
  }
}

/**
 * Fatigue relative to fitness: ATL / CTL (acute:chronic workload ratio).
 * Continuum roughly 0.5 … 1.6
 */
export function assessFatigue(atl: number | null, ctl: number | null): MetricAssessment {
  const ticks = [
    { at: 0, label: '0.5' },
    { at: positionInRange(0.8, 0.5, 1.6), label: '0.8' },
    { at: positionInRange(1.1, 0.5, 1.6), label: '1.1' },
    { at: positionInRange(1.3, 0.5, 1.6), label: '1.3' },
    { at: 1, label: '1.6' },
  ]
  if (atl == null || ctl == null || ctl <= 0) {
    return {
      id: 'fatigue',
      label: 'Fatiga (ATL)',
      value: atl,
      position: null,
      band: null,
      bandLabel: 'Sin datos',
      hint: 'Falta CTL o ATL para comparar.',
      ticks,
    }
  }
  const ratio = atl / ctl
  const band = bandFromThresholds(ratio, [0.8, 1.0, 1.15, 1.3])
  const hints: Record<BandId, string> = {
    very_low: 'Fatiga bien por debajo del fitness: muy recuperado.',
    low: 'Fatiga contenida respecto al fitness.',
    normal: 'ATL alineada con CTL: carga habitual.',
    high: 'Fatiga por encima del fitness: semana exigente.',
    very_high: 'ATL claramente > CTL: riesgo de sobrecarga.',
  }
  return {
    id: 'fatigue',
    label: 'Fatiga (ATL)',
    value: atl,
    position: positionInRange(ratio, 0.5, 1.6),
    band,
    bandLabel: FATIGUE_LABELS[band],
    hint: `${hints[band]} (ATL/CTL ≈ ${ratio.toFixed(2)}).`,
    ticks,
  }
}

export function assessFormStatus(input: {
  form: number | null
  chronicLoad: number | null
  acuteLoad: number | null
  rampRate: number | null
  ctlHistory?: number[]
}): FormStatus {
  const form = assessForm(input.form)
  const fitness = assessFitness(input.chronicLoad, input.ctlHistory ?? [])
  const fatigue = assessFatigue(input.acuteLoad, input.chronicLoad)
  const ramp = assessRamp(input.rampRate)
  return {
    form,
    fitness,
    fatigue,
    ramp,
    summary: form.hint,
  }
}

/**
 * Tailwind-ish tone classes for a band (works in light + dark). `hex` is the
 * same colour for SVG charts, which cannot take a utility class as a fill.
 */
export function bandTone(band: BandId | null): {
  text: string
  bar: string
  soft: string
  hex: string
} {
  switch (band) {
    case 'very_low':
      return { text: 'text-red-500', bar: 'bg-red-500', soft: 'bg-red-500/15', hex: '#ef4444' }
    case 'low':
      return { text: 'text-amber-500', bar: 'bg-amber-500', soft: 'bg-amber-500/15', hex: '#f59e0b' }
    case 'normal':
      return { text: 'text-emerald-500', bar: 'bg-emerald-500', soft: 'bg-emerald-500/15', hex: '#10b981' }
    case 'high':
      return { text: 'text-sky-500', bar: 'bg-sky-500', soft: 'bg-sky-500/15', hex: '#0ea5e9' }
    case 'very_high':
      return { text: 'text-violet-500', bar: 'bg-violet-500', soft: 'bg-violet-500/15', hex: '#8b5cf6' }
    default:
      return { text: 'text-muted', bar: 'bg-slate-400', soft: 'bg-slate-500/10', hex: '#94a3b8' }
  }
}
