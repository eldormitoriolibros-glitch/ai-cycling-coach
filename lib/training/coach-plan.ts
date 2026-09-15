import { tryParseBrief, type TrainingBrief } from './coach-brief'
import { resolveSessionKind, resolveSessionZone } from './session-prescription'

export type CoachSessionType = 'recovery' | 'endurance' | 'long' | 'tempo' | 'threshold' | 'vo2max' | 'strength'

export type CoachSession = {
  date: string
  type: CoachSessionType
  duration_minutes: number
  title?: string
  description?: string
  target_zone?: string
  purpose?: string
}

export type CoachPlan = {
  emphasis?: 'recovery' | 'maintenance' | 'build'
  workouts: CoachSession[]
}

const EMPHASIS = new Set(['recovery', 'maintenance', 'build'])

export function normalizeIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  return null
}

export function normalizeMinutes(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(600, Math.max(15, Math.round(raw)))
  }
  if (typeof raw === 'string') {
    const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/)
    if (match) {
      const n = Number.parseFloat(match[1])
      if (Number.isFinite(n)) return Math.min(600, Math.max(15, Math.round(n)))
    }
  }
  return 60
}

export function normalizeSessionType(raw: unknown): CoachSessionType {
  return resolveSessionKind({ type: String(raw ?? ''), title: String(raw ?? '') })
}

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] != null && raw[key] !== '') return raw[key]
  }
  return undefined
}

export function normalizeCoachSession(raw: unknown): CoachSession | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const date = normalizeIsoDate(pick(row, ['date', 'scheduled_date', 'day']))
  if (!date) return null
  const title = pick(row, ['title', 'name'])
  const description = pick(row, ['description', 'details'])
  const zone = pick(row, ['target_zone', 'zone'])
  const purpose = pick(row, ['purpose', 'objetivo', 'goal'])
  const titleText = typeof title === 'string' ? title : undefined
  const descriptionText = typeof description === 'string' ? description : undefined
  const zoneText = typeof zone === 'string' ? zone : undefined
  const purposeText = typeof purpose === 'string' ? purpose : undefined
  const type = resolveSessionKind({
    type: pick(row, ['type', 'workout_type', 'kind']) as string | undefined,
    title: titleText,
    description: descriptionText,
    zone: zoneText,
  })
  return {
    date,
    type,
    duration_minutes: normalizeMinutes(pick(row, ['duration_minutes', 'duration', 'minutes'])),
    title: titleText ? titleText.slice(0, 200) : undefined,
    description: descriptionText ? descriptionText.slice(0, 1000) : undefined,
    target_zone: (zoneText || resolveSessionZone({ title: titleText, description: descriptionText, kind: type })).slice(0, 20),
    purpose: purposeText ? purposeText.slice(0, 500) : undefined,
  }
}

export function normalizeCoachPlan(raw: unknown): CoachPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const plan = raw as Record<string, unknown>
  const workouts = Array.isArray(plan.workouts)
    ? plan.workouts.map(normalizeCoachSession).filter((w): w is CoachSession => w != null)
    : []
  if (workouts.length === 0) return null
  const emphasis = String(plan.emphasis ?? '')
  return {
    emphasis: EMPHASIS.has(emphasis) ? (emphasis as CoachPlan['emphasis']) : undefined,
    workouts: workouts.slice(0, 32),
  }
}

export function tryParsePlan(raw: string): CoachPlan | null {
  const trimmed = raw.trim()
  const candidates = [trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed = normalizeCoachPlan(JSON.parse(candidate))
      if (parsed) return parsed
    } catch {
      // try next
    }
  }
  return null
}

/**
 * The coach appends hidden ```plan``` / ```brief``` blocks. Split them out so
 * the athlete only sees the prose.
 */
export function splitPlanBlock(message: string): {
  text: string
  plan: CoachPlan | null
  brief: TrainingBrief | null
} {
  let text = message
  let plan: CoachPlan | null = null
  let brief: TrainingBrief | null = null

  const fences = Array.from(text.matchAll(/```(?:plan|brief|json)?\s*\n?([\s\S]*?)```/gi))
  for (const match of fences) {
    const parsedBrief = tryParseBrief(match[1])
    const parsedPlan = tryParsePlan(match[1])
    if (parsedBrief) brief = parsedBrief
    if (parsedPlan) plan = parsedPlan
    if (
      parsedBrief ||
      parsedPlan ||
      /"workouts"\s*:/.test(match[1]) ||
      /"emphasis"\s*:/.test(match[1]) ||
      /"goal_kind"\s*:/.test(match[1])
    ) {
      text = text.replace(match[0], '')
    }
  }

  const trailingBrief = text.match(/(\{[\s\S]*"goal_kind"\s*:[\s\S]*)$/)
  if (trailingBrief && trailingBrief.index != null) {
    const parsed = tryParseBrief(trailingBrief[1])
    if (parsed) {
      brief = parsed
      text = text.slice(0, trailingBrief.index)
    }
  }

  const trailing = text.match(/(\{[\s\S]*"workouts"\s*:\s*\[[\s\S]*)$/)
  if (trailing && trailing.index != null) {
    const parsed = tryParsePlan(trailing[1])
    if (parsed) plan = parsed
    text = text.slice(0, trailing.index)
  }

  text = text
    .replace(/```(?:plan|brief|json)?[\s\S]*$/i, '')
    .replace(/\n?\{[\s\S]*"emphasis"[\s\S]*$/, '')
    .replace(/\n?\{[\s\S]*"goal_kind"[\s\S]*$/, '')
    .trim()

  return { text, plan, brief }
}
