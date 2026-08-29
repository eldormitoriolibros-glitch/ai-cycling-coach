/** Readiness score from recent recovery and load signals. Pure functions only. */
export type ReadinessInput = {
  form: number | null
  restingHr: number | null
  baselineRestingHr: number | null
  hrv: number | null
  baselineHrv: number | null
  sleepHours: number | null
  sleepScore: number | null
  soreness: number | null
  motivation: number | null
  bodyBattery: number | null
  stressAvg: number | null
  spo2: number | null
}

export type ReadinessResult = {
  score: number
  label: string
  flags: string[]
  dataSources: string[]
}

function clamp(v: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, v))
}

/** Map a value in [min..max] to 0..100 */
function normalize(value: number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined) return null
  if (max === min) return 50
  return clamp(((value - min) / (max - min)) * 100, 0, 100)
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const weights: { [k: string]: number } = {
    form: 25,
    sleepHours: 12,
    sleepScore: 8,
    hrv: 12,
    restingHr: 8,
    soreness: 8,
    motivation: 7,
    bodyBattery: 12,
    stressAvg: 8,
  }

  const subs: { [k: string]: number | null } = {}
  subs.form = input.form === null ? null : normalize(input.form, -40, 40)
  subs.sleepHours = input.sleepHours === null ? null : normalize(input.sleepHours, 4, 9)
  subs.sleepScore = input.sleepScore === null ? null : clamp(input.sleepScore, 0, 100)

  if (input.hrv !== null && input.baselineHrv) {
    const ratio = input.hrv / input.baselineHrv
    subs.hrv = clamp((ratio - 0.7) / (1.2 - 0.7) * 100, 0, 100)
  } else {
    subs.hrv = input.hrv === null ? null : normalize(input.hrv, 20, 120)
  }

  if (input.restingHr !== null && input.baselineRestingHr) {
    const ratio = input.baselineRestingHr === 0 ? 1 : input.restingHr / input.baselineRestingHr
    subs.restingHr = clamp((1.3 - ratio) / (1.3 - 0.6) * 100, 0, 100)
  } else {
    subs.restingHr = input.restingHr === null ? null : normalize(input.restingHr, 40, 90)
  }

  subs.soreness = input.soreness === null ? null : clamp(((10 - input.soreness) / 9) * 100, 0, 100)
  subs.motivation = input.motivation === null ? null : clamp(((input.motivation - 1) / 9) * 100, 0, 100)
  subs.bodyBattery = input.bodyBattery === null ? null : clamp(input.bodyBattery, 0, 100)
  // Stress: lower is better. Map 0..75 → 100..0
  subs.stressAvg = input.stressAvg === null ? null : clamp(((75 - input.stressAvg) / 75) * 100, 0, 100)

  // Redistribute weights for nulls
  const presentKeys = Object.keys(weights).filter((k) => subs[k] !== null)
  const totalWeight = presentKeys.reduce((s, k) => s + weights[k], 0)
  const factor = totalWeight > 0 ? 100 / totalWeight : 0

  let score = 0
  for (const k of presentKeys) {
    score += (subs[k] as number) * (weights[k] * factor / 100)
  }
  score = Math.round(clamp(score))

  // Determine data sources
  const dataSources: string[] = []
  const garminSignals = ['bodyBattery', 'stressAvg', 'hrv', 'restingHr', 'sleepHours', 'sleepScore']
  const subjectiveSignals = ['soreness', 'motivation']
  if (garminSignals.some((k) => subs[k] !== null)) dataSources.push('garmin')
  if (subjectiveSignals.some((k) => subs[k] !== null)) dataSources.push('declarado')
  if (dataSources.length === 0 && subs.form !== null) dataSources.push('carga')
  if (dataSources.length === 0) dataSources.push('sin datos')

  let label = 'Aceptable, podés entrenar con moderación'
  if (score >= 70) label = 'Listo para entrenar fuerte'
  else if (score >= 50) label = 'Aceptable, podés entrenar con moderación'
  else if (score >= 35) label = 'Cargado, mejor bajar la intensidad'
  else label = 'Necesitás descanso'

  // Add qualifier if only based on training load
  if (dataSources.length === 1 && dataSources[0] === 'carga') {
    label += ' (basado solo en carga)'
  }
  if (dataSources[0] === 'sin datos') {
    score = 60
    label = 'Sin datos suficientes para evaluar readiness'
  }

  const flags: string[] = []
  if (input.sleepHours !== null && input.sleepHours < 6) flags.push('sueño corto')
  if (input.restingHr !== null && input.baselineRestingHr && input.restingHr / input.baselineRestingHr > 1.1)
    flags.push('FC reposo elevada')
  if (input.hrv !== null && input.baselineHrv && input.hrv / input.baselineHrv < 0.85) flags.push('HRV baja')
  if (input.soreness !== null && input.soreness >= 7) flags.push('dolor alto')
  if (input.form !== null && input.form < -25) flags.push('forma muy negativa')
  if (input.stressAvg !== null && input.stressAvg > 50) flags.push('estrés alto')
  if (input.bodyBattery !== null && input.bodyBattery < 25) flags.push('Body Battery baja')

  return { score, label, flags, dataSources }
}

export type AthleteStateInput = {
  readiness: ReadinessResult
  form: number | null
  sleepHours: number | null
  sleepScore: number | null
  restingHr: number | null
  hrv: number | null
  bodyBatteryHigh: number | null
  stressAvg: number | null
  spo2Avg: number | null
  soreness: number | null
  motivation: number | null
}

/** Format the unified "Estado del atleta (hoy)" section for coach context. */
export function formatAthleteState(input: AthleteStateInput): string[] {
  const { readiness } = input
  const lines: string[] = []

  // Line 1: readiness score + label
  lines.push(`readiness: ${readiness.score}/100 - ${readiness.label}`)

  // Line 2: device/objective signals (only non-null)
  const signals: string[] = []
  if (input.sleepHours != null) signals.push(`sueño: ${input.sleepHours.toFixed(1)} h${input.sleepScore != null ? ` (score ${input.sleepScore})` : ''}`)
  if (input.restingHr != null) signals.push(`FC reposo: ${input.restingHr}`)
  if (input.hrv != null) signals.push(`HRV: ${Math.round(input.hrv)}`)
  if (input.bodyBatteryHigh != null) signals.push(`Body Battery: ${input.bodyBatteryHigh}`)
  if (input.stressAvg != null) signals.push(`estrés: ${input.stressAvg}`)
  if (input.spo2Avg != null) signals.push(`SpO2: ${Math.round(input.spo2Avg)}%`)
  if (input.form != null && signals.length === 0) signals.push(`forma (TSB): ${Math.round(input.form)}`)
  if (signals.length > 0) lines.push(signals.join(' - '))

  // Line 3: subjective signals (only if present)
  const subjective: string[] = []
  if (input.soreness != null) subjective.push(`dolor: ${input.soreness}/10`)
  if (input.motivation != null) subjective.push(`ganas: ${input.motivation}/10`)
  if (subjective.length > 0) lines.push(subjective.join(' - '))

  // Line 4: data source
  const sourceLabel = readiness.dataSources.map((s) => {
    if (s === 'garmin') return 'Garmin (auto)'
    if (s === 'declarado') return 'declarado por el atleta'
    if (s === 'carga') return 'carga de entrenamiento'
    return s
  }).join(' + ')
  lines.push(`fuente: ${sourceLabel}`)

  // Line 5: alerts
  if (readiness.flags.length > 0) lines.push(`alertas: ${readiness.flags.join(', ')}`)

  return lines
}

/** Legacy format for backward compat in tests */
export function formatReadiness(r: ReadinessResult): string[] {
  const lines: string[] = []
  lines.push(`readiness: ${r.score}/100 · ${r.label}`)
  if (r.flags.length) lines.push(`alertas: ${r.flags.join(', ')}`)
  return lines
}
