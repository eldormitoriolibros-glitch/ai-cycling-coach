export type TrainingGoalKind = 'maintenance' | 'ftp' | 'race' | 'return'

export type BriefAvailabilityDay = {
  day_of_week: number
  bike_minutes: number
  strength_minutes: number
}

export type TrainingBrief = {
  goal_kind: TrainingGoalKind
  goal_label?: string
  target_date?: string | null
  horizon_weeks: 4 | 8 | 12
  include_strength: boolean
  notes?: string
  availability: BriefAvailabilityDay[]
}

const GOAL_KINDS = new Set<TrainingGoalKind>(['maintenance', 'ftp', 'race', 'return'])

const GOAL_ALIASES: Record<string, TrainingGoalKind> = {
  maintenance: 'maintenance',
  mantenimiento: 'maintenance',
  maintain: 'maintenance',
  ftp: 'ftp',
  umbral: 'ftp',
  race: 'race',
  carrera: 'race',
  evento: 'race',
  granfondo: 'race',
  return: 'return',
  parate: 'return',
  volver: 'return',
  retorno: 'return',
}

const DAY_ALIASES: Record<string, number> = {
  domingo: 0,
  sunday: 0,
  sun: 0,
  lunes: 1,
  monday: 1,
  mon: 1,
  martes: 2,
  tuesday: 2,
  tue: 2,
  miercoles: 3,
  miércoles: 3,
  wednesday: 3,
  wed: 3,
  jueves: 4,
  thursday: 4,
  thu: 4,
  viernes: 5,
  friday: 5,
  fri: 5,
  sabado: 6,
  sábado: 6,
  saturday: 6,
  sat: 6,
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const GOAL_LABEL: Record<TrainingGoalKind, string> = {
  maintenance: 'mantenimiento',
  ftp: 'subir FTP',
  race: 'carrera / evento',
  return: 'volver de un parate',
}

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] != null && raw[key] !== '') return raw[key]
  }
  return undefined
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

function asMinutes(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(1440, Math.max(0, Math.round(raw)))
  }
  if (typeof raw === 'string') {
    const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/)
    if (match) {
      const n = Number.parseFloat(match[1])
      if (Number.isFinite(n)) {
        if (/h\b|hora/i.test(raw) && n <= 24) return Math.min(1440, Math.max(0, Math.round(n * 60)))
        return Math.min(1440, Math.max(0, Math.round(n)))
      }
    }
  }
  return 0
}

export function normalizeGoalKind(raw: unknown): TrainingGoalKind | null {
  if (raw == null) return null
  const folded = fold(String(raw))
  if (GOAL_KINDS.has(folded as TrainingGoalKind)) return folded as TrainingGoalKind
  for (const [alias, kind] of Object.entries(GOAL_ALIASES)) {
    if (folded === alias || folded.includes(alias)) return kind
  }
  return null
}

function normalizeHorizon(raw: unknown): 4 | 8 | 12 {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return 4
  if (n <= 6) return 4
  if (n <= 10) return 8
  return 12
}

function normalizeDayOfWeek(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6) return raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (/^[0-6]$/.test(trimmed)) return Number(trimmed)
    const alias = DAY_ALIASES[fold(trimmed)]
    if (alias != null) return alias
  }
  return null
}

function asBoolean(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const folded = fold(raw)
    return folded === 'si' || folded === 'yes' || folded === 'true' || folded === '1'
  }
  return false
}

function asHoursToMinutes(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(1440, Math.max(0, Math.round(raw * 60)))
  }
  return asMinutes(raw)
}

export function normalizeAvailabilityDay(raw: unknown): BriefAvailabilityDay | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const day = normalizeDayOfWeek(pick(row, ['day_of_week', 'day', 'weekday', 'dow']))
  if (day == null) return null
  const bike =
    pick(row, ['bike_minutes', 'bike']) != null
      ? asMinutes(pick(row, ['bike_minutes', 'bike']))
      : pick(row, ['bike_hours', 'hours']) != null
        ? asHoursToMinutes(pick(row, ['bike_hours', 'hours']))
        : asMinutes(pick(row, ['minutes']))
  const strength =
    pick(row, ['strength_minutes']) != null
      ? asMinutes(pick(row, ['strength_minutes']))
      : pick(row, ['strength_hours']) != null
        ? asHoursToMinutes(pick(row, ['strength_hours']))
        : asMinutes(pick(row, ['strength']))
  return { day_of_week: day, bike_minutes: bike, strength_minutes: strength }
}

/**
 * Hidden ```brief``` JSON from the coach. Requires a goal; availability is
 * optional so the coach can lock the "why" before the typical week is clear.
 */
export function normalizeTrainingBrief(raw: unknown): TrainingBrief | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (Array.isArray(row.workouts) && row.goal_kind == null && row.horizon_weeks == null) return null

  const goal_kind = normalizeGoalKind(pick(row, ['goal_kind', 'goal', 'objetivo']))
  if (!goal_kind) return null

  const availability = Array.isArray(row.availability)
    ? row.availability.map(normalizeAvailabilityDay).filter((d): d is BriefAvailabilityDay => d != null)
    : []

  const label = pick(row, ['goal_label', 'label', 'event', 'evento'])
  const notes = pick(row, ['notes', 'notas'])
  const include =
    pick(row, ['include_strength', 'strength', 'fuerza']) != null
      ? asBoolean(pick(row, ['include_strength', 'strength', 'fuerza']))
      : availability.some((d) => d.strength_minutes > 0)

  return {
    goal_kind,
    goal_label: typeof label === 'string' ? label.slice(0, 200) : undefined,
    target_date: isoDate(pick(row, ['target_date', 'date', 'fecha'])),
    horizon_weeks: normalizeHorizon(pick(row, ['horizon_weeks', 'horizon', 'weeks', 'semanas'])),
    include_strength: include,
    notes: typeof notes === 'string' ? notes.slice(0, 500) : undefined,
    availability,
  }
}

export function tryParseBrief(raw: string): TrainingBrief | null {
  const trimmed = raw.trim()
  const candidates = [trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed = normalizeTrainingBrief(JSON.parse(candidate))
      if (parsed) return parsed
    } catch {
      // try next
    }
  }
  return null
}

/** Seven-day grid for upserting availability. Missing days become 0. */
export function availabilityRowsFromBrief(brief: TrainingBrief): BriefAvailabilityDay[] {
  const byDay = new Map(brief.availability.map((d) => [d.day_of_week, d]))
  return Array.from({ length: 7 }, (_, day_of_week) => {
    const found = byDay.get(day_of_week)
    const strength = brief.include_strength ? (found?.strength_minutes ?? 0) : 0
    return {
      day_of_week,
      bike_minutes: found?.bike_minutes ?? 0,
      strength_minutes: strength,
    }
  })
}

export function formatTrainingBrief(
  brief: {
    goal_kind: TrainingGoalKind
    goal_label?: string | null
    target_date?: string | null
    horizon_weeks: number
    include_strength: boolean
    notes?: string | null
  } | null
): string[] {
  const lines = ['## Brief de entrenamiento']
  if (!brief) {
    lines.push(
      '- sin brief: preguntá objetivo, horizonte (4/8/12 semanas o una fecha) y la semana típica (días, techo de horas, fuerza) antes de recetar un ciclo. No inventes horas ni objetivo.'
    )
    return lines
  }

  const goal = brief.goal_label?.trim()
    ? `${GOAL_LABEL[brief.goal_kind]} (${brief.goal_label.trim()})`
    : GOAL_LABEL[brief.goal_kind]
  lines.push(`- objetivo: ${goal}`)
  lines.push(`- horizonte: ${brief.horizon_weeks} semanas`)
  if (brief.target_date) lines.push(`- fecha objetivo: ${brief.target_date}`)
  lines.push(`- fuerza: ${brief.include_strength ? 'sí, junto con la bici' : 'no, solo bici'}`)
  if (brief.notes?.trim()) lines.push(`- notas: ${brief.notes.trim()}`)
  lines.push(
    `- cada propuesta es el próximo ciclo de 4 semanas dentro de este macro, no una semana suelta ni las ${brief.horizon_weeks} semanas de una.`
  )
  return lines
}

export function formatAvailabilityLine(day: BriefAvailabilityDay): string | null {
  if (day.bike_minutes <= 0 && day.strength_minutes <= 0) return null
  const parts = [
    day.bike_minutes > 0 ? `${(day.bike_minutes / 60).toFixed(1)} h bici` : null,
    day.strength_minutes > 0 ? `${(day.strength_minutes / 60).toFixed(1)} h fuerza` : null,
  ].filter(Boolean)
  return `- ${DAY_NAMES[day.day_of_week]}: ${parts.join(', ')}`
}
