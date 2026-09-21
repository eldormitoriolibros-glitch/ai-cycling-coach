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

const DEFAULT_UPPER: StrengthExercise[] = [
  { exercise: 'Movilidad de hombros y tórax', sets: '1', reps: '5 min', note: 'Sin carga, rango amplio' },
  { exercise: 'Remo (banda o mancuerna)', sets: '3', reps: '8–12', note: 'Escápula baja, sin encoger hombros' },
  { exercise: 'Empuje (press o fondos)', sets: '3', reps: '8–12', note: 'Sin bloquear codos de golpe' },
  { exercise: 'Espinales / face pull', sets: '2–3', reps: '10–15', note: 'Espalda neutra, sin hiperextender' },
  { exercise: 'Core anti-rotación (Pallof o plancha lateral)', sets: '3', reps: '8–12 / lado', note: 'Pelvis neutra, sin apnea' },
  { exercise: 'Vuelta: movilidad suave', sets: '1', reps: '3 min', note: 'Cierre, sin fatiga' },
]

const GENERIC_STRENGTH =
  /trabajo de fuerza|fuera de la bici|sesi[oó]n de fuerza|independiente de la bici|fuerza liviana/i
const UPPER_HINT =
  /torso|superior|zona media|upper|push[\s-]?pull|remos?|empujes?|press|spinal|anti-?rotaci|sin cargar las piernas|no (?:cargar|trabajar) (?:las )?piernas/i
const LOWER_HINT = /piernas?|sentadilla|squat|peso muerto|rdl|prensa|hip hinge/i

import { hasIntervalSeries } from './session-notes'
import {
  expandIntervalShorthand,
  looksGenericEnduranceText,
  looksGroupRide,
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
/** Entrada / rodada / vuelta that fit the booked time. No series, no invented watts. */
export function groupRideBlocks(totalMinutes: number): WorkoutBlock[] {
  const total = Math.max(30, totalMinutes)
  const { warmup, cooldown } = warmupCooldownMinutes('endurance', total)
  return [
    { label: 'Entrada en calor', minutes: warmup, repeats: null, intensity: 'Z1–Z2' },
    {
      label: 'Rodada',
      minutes: Math.max(10, total - warmup - cooldown),
      repeats: null,
      intensity: 'grupeta',
    },
    { label: 'Vuelta a la calma', minutes: cooldown, repeats: null, intensity: 'Z1' },
  ]
}

export function formatGroupRideDescription(totalMinutes: number): string {
  const [warmup, main, cooldown] = groupRideBlocks(totalMinutes)
  return `${warmup.minutes} min de entrada en calor en Z1–Z2. ${main.minutes} min de rodada en grupeta. ${cooldown.minutes} min de vuelta a la calma en Z1.`
}

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
  if (
    looksGroupRide(input.title, input.rawDescription) &&
    !hasIntervalSeries(input.title, input.rawDescription)
  ) {
    return formatGroupRideDescription(input.minutes)
  }
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

/**
 * What we persist on commit. If the coach wrote a description, keep it —
 * filling entrada/vuelta from the template contradicted the chat.
 */
export function commitSessionDescription(input: {
  kind: string
  minutes: number
  zone: string
  title?: string | null
  rawDescription?: string | null
  templateMainWork: string
}): string {
  const raw = input.rawDescription?.trim() ?? ''
  if (looksGroupRide(input.title, raw) && !hasIntervalSeries(input.title, raw)) {
    return formatGroupRideDescription(input.minutes).slice(0, 1000)
  }
  if (input.kind === 'strength') {
    return (raw || `${input.templateMainWork}.`).slice(0, 1000)
  }
  if (raw) return dedupeWarmupCooldownProse(raw).slice(0, 1000)
  return buildBikeSessionDescription({
    kind: input.kind,
    minutes: input.minutes,
    zone: input.zone,
    title: input.title,
    rawDescription: raw,
    templateMainWork: input.templateMainWork,
  }).slice(0, 1000)
}

/** Strength table: named exercises from the prescription, or a template that matches the intent. */
export function strengthExercises(
  description: string | null | undefined,
  title?: string | null
): StrengthExercise[] {
  const text = (description ?? '').replace(/\s+/g, ' ').trim()
  const structured = parseStructuredStrength(text)
  if (structured.length >= 2) return structured

  const named = parseNamedStrengthExercises(text)
  if (named.length >= 2) return wrapStrengthSession(named, parseStrengthScheme(text))

  const hint = [title, text].filter(Boolean).join('. ').toLowerCase()
  if (UPPER_HINT.test(hint) && !LOWER_HINT.test(hint)) return DEFAULT_UPPER
  if (!hint.trim() || GENERIC_STRENGTH.test(hint)) return DEFAULT_STRENGTH
  if (UPPER_HINT.test(hint)) return DEFAULT_UPPER
  return DEFAULT_STRENGTH
}

/**
 * "Movilidad articular 5 min. 3×45s plancha frontal, 3×10 perro de caza, cierre 5 min."
 * Each move keeps its own sets and reps. A trailing "3x12" on a name list does not.
 */
function parseStructuredStrength(text: string): StrengthExercise[] {
  if (!text) return []
  const token =
    /(?:(movilidad(?:\s+articular)?|cierre|estiramiento|entrada(?:\s+en\s+calor)?|vuelta(?:\s+a\s+la\s+calma)?)\s+(\d+)\s*min(?:utos)?(?:\s+(estiramiento))?)|(?:(\d+)\s*[x×]\s*(\d+)\s*(s|seg(?:undos)?|min(?:utos)?)?\s+([^,.;]+))/gi
  const rows: StrengthExercise[] = []
  for (const match of text.matchAll(token)) {
    if (match[1] && match[2]) {
      rows.push(timedStrengthRow(match[1], match[2], match[3]))
    } else if (match[4] && match[5] && match[7]) {
      rows.push(schemeStrengthRow(match[4], match[5], match[6], match[7]))
    }
  }
  const work = rows.filter((row) => !isStrengthBookend(row.exercise))
  if (work.length < 1) return []
  return ensureStrengthBookends(rows)
}

function timedStrengthRow(kind: string, minutes: string, extra?: string): StrengthExercise {
  const closing = /cierre|estiramiento|vuelta/i.test(kind)
  return {
    exercise: capitalizeExercise(kind),
    sets: '1',
    reps: `${minutes} min`,
    note: closing
      ? extra
        ? 'Estiramiento, sin fatiga'
        : 'Cierre, sin fatiga'
      : 'Sin carga, rango amplio',
  }
}

function schemeStrengthRow(
  sets: string,
  reps: string,
  unit: string | undefined,
  rawName: string
): StrengthExercise {
  let name = rawName.trim().replace(/[.\s]+$/g, '')
  const side = /\bpor\s+lado$/i.test(name)
  if (side) name = name.replace(/\s+por\s+lado$/i, '').trim()
  const unitLabel = !unit
    ? ''
    : /^s|^seg/i.test(unit)
      ? ' s'
      : ' min'
  return {
    exercise: capitalizeExercise(name),
    sets,
    reps: `${reps}${unitLabel}${side ? ' / lado' : ''}`,
    note: noteForExercise(name),
  }
}

function isStrengthBookend(name: string): boolean {
  return /movilidad|entrada|cierre|estiramiento|vuelta|enfriamiento/i.test(name)
}

function ensureStrengthBookends(rows: StrengthExercise[]): StrengthExercise[] {
  const hasWarmup = rows.some((row) => /movilidad|entrada|calentamiento/i.test(row.exercise))
  const hasCooldown = rows.some((row) => /vuelta|cierre|enfriamiento|estiramiento/i.test(row.exercise))
  return [
    ...(hasWarmup
      ? []
      : [{ exercise: 'Movilidad de entrada', sets: '1', reps: '5 min', note: 'Hombros, tórax, cadera' }]),
    ...rows,
    ...(hasCooldown
      ? []
      : [{ exercise: 'Vuelta: movilidad suave', sets: '1', reps: '3 min', note: 'Cierre, sin fatiga' }]),
  ]
}

function parseStrengthScheme(text: string): { sets: string; reps: string } | null {
  const match = text.match(/(\d+)\s*[x×]\s*(\d+(?:\s*[–-]\s*\d+)?)/i)
  if (!match) return null
  return { sets: match[1], reps: match[2].replace(/\s+/g, '') }
}

function parseNamedStrengthExercises(text: string): string[] {
  const withoutScheme = text.replace(/\d+\s*[x×]\s*\d+(?:\s*[–-]\s*\d+)?/gi, ' ').replace(/\s+/g, ' ').trim()
  const colon = withoutScheme.lastIndexOf(':')
  let body = colon >= 0 ? withoutScheme.slice(colon + 1) : withoutScheme
  if (colon < 0) {
    const lead = withoutScheme.match(/^(?:rutina|circuito|trabajo|sesi[oó]n)\s+de\s+(.+)$/i)
    if (lead) body = lead[1]
  }
  body = body.replace(/[.]+$/g, '').trim()
  if (!body) return []

  return body
    .split(/\s*(?:,|;|\s+y\s+)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .filter((part) => !/^(minutos?|series?|vueltas?|calidad|carga|rutina|circuito|fuerza|torso|zona media|independiente.*|la bici)$/i.test(part))
    .filter((part) => !GENERIC_STRENGTH.test(part))
}

function wrapStrengthSession(
  names: string[],
  scheme: { sets: string; reps: string } | null
): StrengthExercise[] {
  const work = names.map((name) => {
    const core = looksCoreExercise(name)
    return {
      exercise: capitalizeExercise(name),
      sets: scheme?.sets ?? '3',
      reps: scheme?.reps ?? (core ? '20–40 s' : '8–12'),
      note: noteForExercise(name),
    }
  })
  return ensureStrengthBookends(work)
}

function looksCoreExercise(name: string): boolean {
  return /core|plancha|dead\s*bug|anti-?rot|pallof|hollow/i.test(name)
}

function capitalizeExercise(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function noteForExercise(name: string): string {
  if (/remo/i.test(name)) return 'Tirón, escápula baja'
  if (/empuje|press|fondos/i.test(name)) return 'Sin bloquear codos de golpe'
  if (/spinal|face\s*pull/i.test(name)) return 'Espalda neutra, sin hiperextender'
  if (/anti-?rot|pallof|core|plancha|dead\s*bug/i.test(name)) return 'Pelvis neutra, sin apnea'
  if (/sentadilla|prensa|squat/i.test(name)) return 'Controlado, rango completo'
  if (/muerto|hinge|rdl/i.test(name)) return 'Espalda neutra'
  return 'Calidad antes que carga'
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
  if (looksGroupRide(title, input.description) && !hasIntervalSeries(title, input.description)) {
    return groupRideBlocks(input.minutes && input.minutes > 0 ? input.minutes : 60)
  }
  const text = [title, input.description ?? ''].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim()
  const blocks: WorkoutBlock[] = []
  const compact = parseCompactIntervals(title) ?? parseCompactIntervals(input.description)
  const stated = parseStatedIntervals(text)
  const work = stated ?? (compact
    ? { repeats: compact.repeats, minutes: compact.minutes, intensity: compact.intensity }
    : null)

  const warmup = text.match(
    /(\d+)\s*min(?:utos)?\s+de\s+entrada(?:\s+en\s+calor)?(?:\s+progresiva)?(?:(?:\s+en)?\s+(Z[1-5](?:\s*[–-]\s*Z[1-5])?))?/i
  )
  if (warmup) {
    blocks.push({
      label: 'Entrada en calor',
      minutes: Number(warmup[1]),
      repeats: null,
      intensity: warmup[2] ? warmup[2].replace(/\s+/g, '') : 'Z1–Z2',
    })
  }

  if (work) {
    blocks.push({
      label: 'Intervalos',
      minutes: work.minutes,
      repeats: work.repeats,
      intensity: work.intensity,
    })
    const recovery = parseIntervalRecovery(text, work.repeats, compact && !stated ? compact : null)
    if (recovery) blocks.push(recovery)
  }

  const explicitSteady = parseExplicitSteady(text)
  if (explicitSteady) {
    blocks.push({
      label: 'Bloque principal',
      minutes: explicitSteady.minutes,
      repeats: null,
      intensity: explicitSteady.intensity,
    })
  } else if (!work) {
    const steady = text.match(/ritmo constante en (Z[1-5])/i)
    const afterMinutes = text.match(/después,?\s+(\d+)\s*min(?:utos)?\s+en\s+(Z[1-5])/i)
    const mainMinutes = afterMinutes ? Number(afterMinutes[1]) : null
    const mainZone = afterMinutes?.[2] ?? steady?.[1] ?? input.zone
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

function parseStatedIntervals(text: string): { repeats: number; minutes: number; intensity: string | null } | null {
  const match = text.match(
    /(\d+)\s*(?:bloques|series|pasadas|intervalos|repeticiones|reps?|chispazos)\s+de\s+(\d+)\s*min(?:utos)?(?:\s+(?:en\s+|al\s+|a\s+)?(Z[1-5]|FTP|umbral|fuerte|tempo|sweet\s*spot))?/i
  )
  if (!match) return null
  return {
    repeats: Number(match[1]),
    minutes: Number(match[2]),
    intensity: normalizeIntensity(match[3]),
  }
}

function parseIntervalRecovery(
  text: string,
  repeats: number,
  compact: { restMinutes: number; restExplicit: boolean } | null
): WorkoutBlock | null {
  const suaves = text.match(/(\d+)\s*min(?:utos)?\s+suaves(?:\s+entre(?:\s+(?:medio|cada\s+uno))?)?/i)
  const minutes =
    parseRestMinutes(text) ??
    (suaves ? Number(suaves[1]) : null) ??
    (compact ? compact.restMinutes : null)
  if (minutes == null) return null

  const zoneMatch =
    text.match(/recuper\w*[^.]*?\ben\s+(Z[1-5])/i) ??
    text.match(/\d+\s*min(?:utos)?\s+en\s+(Z[1-5])\s+entre/i)

  return {
    label: 'Recuperación entre series',
    minutes,
    repeats: repeats > 1 ? repeats - 1 : null,
    intensity: zoneMatch?.[1] ? zoneMatch[1].toUpperCase() : 'Z1–Z2',
  }
}

function parseExplicitSteady(text: string): { minutes: number | null; intensity: string | null } | null {
  const continuous = text.match(/(\d+)\s*min(?:utos)?\s+continuos?(?:\s+en\s+(Z[1-5]))?/i)
  if (continuous) {
    return {
      minutes: Number(continuous[1]),
      intensity: continuous[2] ? continuous[2].toUpperCase() : null,
    }
  }
  const after = text.match(/después,?\s+(\d+)\s*min(?:utos)?\s+en\s+(Z[1-5])/i)
  if (after) {
    return { minutes: Number(after[1]), intensity: after[2].toUpperCase() }
  }
  return null
}
