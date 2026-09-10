export type WorkoutBlock = {
  label: string
  minutes: number | null
  repeats: number | null
  intensity: string | null
}

export type StrengthExercise = {
  exercise: string
  sets: string
  reps: string
  note: string
}

const DEFAULT_STRENGTH: StrengthExercise[] = [
  { exercise: 'Movilidad de entrada', sets: '1', reps: '5 min', note: 'Cadera, tobillos, hombros' },
  { exercise: 'Sentadilla o prensa', sets: '3', reps: '8–12', note: 'Controlado, rango completo' },
  { exercise: 'Peso muerto rumano / hip hinge', sets: '3', reps: '8–12', note: 'Espalda neutra' },
  { exercise: 'Empuje (fondos o press)', sets: '3', reps: '8–12', note: 'Sin bloquear codos de golpe' },
  { exercise: 'Core (plancha o dead bug)', sets: '3', reps: '30–45 s', note: 'Sin apnea' },
  { exercise: 'Vuelta: movilidad suave', sets: '1', reps: '5 min', note: 'Cierre, sin fatiga' },
]

import {
  expandIntervalShorthand,
  looksGenericEnduranceText,
  parseCompactIntervals,
  parseRestMinutes,
} from './session-prescription'

const HARD_KIND = /tempo|threshold|vo2|umbral/i

/** Warmup and cooldown that fit inside the total session time (not extra). */
export function warmupCooldownMinutes(
  kind: string | null | undefined,
  totalMinutes: number
): { warmup: number; cooldown: number } {
  const total = Math.max(20, totalMinutes)
  const hard = HARD_KIND.test(kind ?? '')
  let warmup = hard ? 15 : 10
  let cooldown = hard ? 10 : 8
  if (total < 45) {
    warmup = 8
    cooldown = 5
  } else if (total >= 120) {
    warmup = hard ? 20 : 15
    cooldown = 10
  }
  if (warmup + cooldown > total - 10) {
    warmup = Math.max(5, Math.round((total - 10) * 0.55))
    cooldown = Math.max(4, total - 10 - warmup)
  }
  return { warmup, cooldown }
}

const WARMUP_SENTENCE =
  /\d+\s*min(?:utos)?\s+de\s+entrada(?:\s+en\s+calor)?(?:\s+progresiva)?(?:\s+en\s+Z[1-5](?:\s*[–-]\s*Z[1-5])?)?/i
const COOLDOWN_SENTENCE =
  /\d+\s*min(?:utos)?\s+de\s+vuelta(?:\s+a\s+la\s+calma)?(?:\s+en\s+Z[1-5])?/i
const TOTAL_NOTE = /el tiempo total\s*\([^)]+\)\s+incluye entrada y vuelta\.?/i

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Drops warmup / cooldown / total-time sentences so we can wrap them once. */
export function stripWarmupCooldown(text: string): string {
  return splitSentences(text)
    .filter((s) => !WARMUP_SENTENCE.test(s) && !COOLDOWN_SENTENCE.test(s) && !TOTAL_NOTE.test(s))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
}

/**
 * If the coach already wrote entrada/vuelta and we wrapped again, keep the
 * inner pair: last leading warmup, first trailing cooldown.
 */
export function dedupeWarmupCooldownProse(text: string | null | undefined): string {
  const raw = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''

  const sentences = splitSentences(raw)
  const isWarmup = (s: string) => WARMUP_SENTENCE.test(s)
  const isCooldown = (s: string) => COOLDOWN_SENTENCE.test(s)
  const isTotal = (s: string) => TOTAL_NOTE.test(s)

  let start = 0
  while (start < sentences.length && isWarmup(sentences[start])) start++
  let end = sentences.length
  while (end > start && (isCooldown(sentences[end - 1]) || isTotal(sentences[end - 1]))) end--

  const leading = sentences.slice(0, start)
  const middle = sentences.slice(start, end)
  const trailing = sentences.slice(end)
  const warmup = leading.length ? [leading[leading.length - 1]] : []
  const cooldown = trailing.find(isCooldown)
  const total = trailing.find(isTotal)

  return [...warmup, ...middle, ...(cooldown ? [cooldown] : []), ...(total ? [total] : [])]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Full bike prescription: warmup + main work + cooldown, totaling `totalMinutes`.
 * `mainWork` may already mention entrada/vuelta; those sentences are stripped
 * so they are not written twice.
 */
export function formatBikeDescription(input: {
  kind: string
  totalMinutes: number
  zone: string
  mainWork: string
}): string {
  const { warmup, cooldown } = warmupCooldownMinutes(input.kind, input.totalMinutes)
  const hard = HARD_KIND.test(input.kind)
  const entrada = hard
    ? `${warmup} min de entrada en calor progresiva en Z1–Z2`
    : `${warmup} min de entrada en calor en Z1–Z2`
  const main = stripWarmupCooldown(input.mainWork).replace(/\.\s*$/, '')
  const body = main ? `${entrada}. ${main}.` : `${entrada}.`
  return `${body} ${cooldown} min de vuelta a la calma en Z1. El tiempo total (${input.totalMinutes} min) incluye entrada y vuelta.`
}

/** Turns a coach JSON description into the prose we persist on the workout. */
export function buildBikeSessionDescription(input: {
  kind: string
  minutes: number
  zone: string
  title?: string | null
  rawDescription?: string | null
  templateMainWork: string
}): string {
  const rawDescription = input.rawDescription?.trim() ?? ''
  const fromTitle = expandIntervalShorthand(input.title, rawDescription)
  const structured =
    Boolean(rawDescription) &&
    /entrada|vuelta a la calma/i.test(rawDescription) &&
    !looksGenericEnduranceText(rawDescription)

  if (structured) return dedupeWarmupCooldownProse(rawDescription)

  const mainWork =
    fromTitle && (!rawDescription || looksGenericEnduranceText(rawDescription))
      ? fromTitle
      : rawDescription && !looksGenericEnduranceText(rawDescription)
        ? stripWarmupCooldown(rawDescription)
        : fromTitle || input.templateMainWork

  return formatBikeDescription({
    kind: input.kind,
    totalMinutes: input.minutes,
    zone: input.zone,
    mainWork,
  })
}

/** Default strength table when the plan only has a generic "fuerza/core" note. */
export function strengthExercises(description: string | null | undefined): StrengthExercise[] {
  const text = (description ?? '').toLowerCase()
  const generic =
    !text.trim() ||
    /trabajo de fuerza|fuera de la bici|sesión de fuerza|independiente de la bici/.test(text)
  return generic ? DEFAULT_STRENGTH : []
}

/**
 * Turns a free-text bike prescription into rows for a detail table.
 * Always includes entrada and vuelta, even if the original text omitted them.
 */
export function parseWorkoutBlocks(description: string | null | undefined): WorkoutBlock[] {
  return blocksForBikeSession({ description, minutes: null, zone: null, kind: null })
}

export function blocksForBikeSession(input: {
  description: string | null | undefined
  minutes: number | null
  zone: string | null
  kind: string | null | undefined
  title?: string | null
}): WorkoutBlock[] {
  const title = (input.title ?? '').replace(/\s+/g, ' ').trim()
  const text = [title, input.description ?? ''].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim()
  const blocks: WorkoutBlock[] = []
  const compact = parseCompactIntervals(title) ?? parseCompactIntervals(input.description)

  const warmup = text.match(
    /(\d+)\s*min(?:utos)?\s+de\s+entrada(?:\s+en\s+calor)?(?:\s+progresiva)?(?:\s+en\s+(Z[1-5](?:\s*[–-]\s*Z[1-5])?))?/i
  )
  if (warmup) {
    blocks.push({
      label: 'Entrada en calor',
      minutes: Number(warmup[1]),
      repeats: null,
      intensity: warmup[2] ? warmup[2].replace(/\s+/g, '') : 'Z1–Z2',
    })
  }

  const intervals = text.match(
    /(\d+)\s*(?:bloques|series)\s+de\s+(\d+)\s*min(?:utos)?(?:\s+(?:en\s+|al\s+)?(Z[1-5]|FTP|umbral|fuerte|tempo|sweet\s*spot))?/i
  )
  if (intervals) {
    blocks.push({
      label: 'Intervalos',
      minutes: Number(intervals[2]),
      repeats: Number(intervals[1]),
      intensity: normalizeIntensity(intervals[3]),
    })
  } else if (compact) {
    blocks.push({
      label: 'Intervalos',
      minutes: compact.minutes,
      repeats: compact.repeats,
      intensity: compact.intensity,
    })
  }

  const recovery = text.match(
    /(\d+)\s*min(?:utos)?\s+suaves(?:\s+entre(?:\s+(?:medio|cada\s+uno))?)?/i
  )
  if (intervals && recovery) {
    blocks.push({
      label: 'Recuperación entre series',
      minutes: Number(recovery[1]),
      repeats: Number(intervals[1]) > 1 ? Number(intervals[1]) - 1 : null,
      intensity: 'Z1–Z2',
    })
  } else if (compact) {
    blocks.push({
      label: 'Recuperación entre series',
      minutes: compact.restExplicit ? compact.restMinutes : (parseRestMinutes(text) ?? compact.restMinutes),
      repeats: compact.repeats > 1 ? compact.repeats - 1 : null,
      intensity: 'Z1–Z2',
    })
  }

  const steady = text.match(
    /(?:ritmo constante en |después,?\s+(\d+)\s*min(?:utos)?\s+en\s+)(Z[1-5])/i
  )
  const afterMinutes = text.match(/después,?\s+(\d+)\s*min(?:utos)?\s+en\s+(Z[1-5])/i)
  if (!intervals && !compact) {
    const mainMinutes = afterMinutes ? Number(afterMinutes[1]) : null
    const mainZone = afterMinutes?.[2] ?? steady?.[2] ?? input.zone
    if (mainZone || mainMinutes != null) {
      blocks.push({
        label: 'Bloque principal',
        minutes: mainMinutes,
        repeats: null,
        intensity: mainZone ? String(mainZone).toUpperCase() : null,
      })
    }
  }

  const cooldown = text.match(/(\d+)\s*min(?:utos)?\s+de\s+vuelta(?:\s+a\s+la\s+calma)?(?:\s+en\s+(Z[1-5]))?/i)
  if (cooldown) {
    blocks.push({
      label: 'Vuelta a la calma',
      minutes: Number(cooldown[1]),
      repeats: null,
      intensity: cooldown[2] ?? 'Z1',
    })
  }

  const total = input.minutes && input.minutes > 0 ? input.minutes : null
  const { warmup: defW, cooldown: defC } = warmupCooldownMinutes(input.kind, total ?? 60)

  if (!blocks.some((b) => b.label === 'Entrada en calor')) {
    blocks.unshift({
      label: 'Entrada en calor',
      minutes: defW,
      repeats: null,
      intensity: 'Z1–Z2',
    })
  }
  if (!blocks.some((b) => b.label === 'Bloque principal') && !blocks.some((b) => b.label === 'Intervalos')) {
    const w = blocks.find((b) => b.label === 'Entrada en calor')?.minutes ?? defW
    const c = defC
    const main = total != null ? Math.max(10, total - (w ?? 0) - c) : null
    blocks.splice(1, 0, {
      label: 'Bloque principal',
      minutes: main,
      repeats: null,
      intensity: input.zone ?? 'Z2',
    })
  }
  if (!blocks.some((b) => b.label === 'Vuelta a la calma')) {
    blocks.push({
      label: 'Vuelta a la calma',
      minutes: defC,
      repeats: null,
      intensity: 'Z1',
    })
  }

  return blocks
}

function normalizeIntensity(value: string | undefined): string | null {
  if (!value) return null
  const v = value.toLowerCase()
  if (v === 'ftp' || v === 'umbral' || v.includes('sweet')) return 'FTP / Z4'
  if (v === 'fuerte') return 'Z5'
  if (v === 'tempo') return 'Z3'
  return value.toUpperCase()
}
