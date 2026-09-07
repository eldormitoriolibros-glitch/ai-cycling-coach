export type SessionKind = 'recovery' | 'endurance' | 'long' | 'tempo' | 'threshold' | 'vo2max' | 'strength'

export type CompactIntervals = {
  repeats: number
  minutes: number
  intensity: string
  restMinutes: number
}

const KIND_RANK: Record<SessionKind, number> = {
  recovery: 1,
  endurance: 2,
  long: 2,
  strength: 2,
  tempo: 3,
  threshold: 4,
  vo2max: 5,
}

export function parseCompactIntervals(text: string | null | undefined): CompactIntervals | null {
  const raw = (text ?? '').replace(/\s+/g, ' ')
  const match = raw.match(/(\d+)\s*[x×]\s*(\d+)\s*m(?:in)?/i) ?? raw.match(/(\d+)\s*[x×]\s*(\d+)(?!\d)/i)
  if (!match) return null
  const repeats = Number(match[1])
  const minutes = Number(match[2])
  if (!repeats || !minutes || repeats > 20 || minutes > 60) return null

  const around = raw.slice(Math.max(0, (match.index ?? 0) - 12), (match.index ?? 0) + match[0].length + 40)
  const intensity = inferZoneFromText(around) ?? inferZoneFromText(raw) ?? (minutes <= 5 ? 'Z5' : minutes <= 15 ? 'Z4' : 'Z3')
  const restMinutes = minutes <= 5 ? minutes : Math.max(3, Math.round(minutes / 2))
  return { repeats, minutes, intensity, restMinutes }
}

export function inferZoneFromText(text: string | null | undefined): string | null {
  const raw = (text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!raw.trim()) return null
  if (/sweet\s*spot|ftp|umbral|threshold/.test(raw)) return 'Z4'
  if (/\bz5\b|vo2/.test(raw)) return 'Z5'
  if (/\bz4\b/.test(raw)) return 'Z4'
  if (/\bz3\b|tempo/.test(raw)) return 'Z3'
  if (/\bz1\b|regen/.test(raw)) return 'Z1'
  if (/\bz2\b/.test(raw) && !/\d+\s*[x×]\s*\d+/.test(raw)) return 'Z2'
  const z = raw.match(/\bz\s*([1-5])\b/)
  return z ? `Z${z[1]}` : null
}

export function inferKindFromText(text: string | null | undefined): SessionKind | null {
  const raw = (text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!raw.trim()) return null
  if (/\b(fuerza|strength|gym|gimnasio|core)\b/.test(raw)) return 'strength'
  if (/vo2|\bz5\b/.test(raw)) return 'vo2max'
  if (/\b(threshold|umbral|ftp|sweet\s*spot|sst|z4)\b/.test(raw)) return 'threshold'
  if (/\b(tempo|z3)\b/.test(raw)) return 'tempo'
  if (/\b(long|largo)\b/.test(raw)) return 'long'
  if (/\b(recovery|regen|regenerativo|z1)\b/.test(raw)) return 'recovery'
  const compact = parseCompactIntervals(raw)
  if (compact) {
    if (compact.minutes <= 5) return 'vo2max'
    if (compact.minutes <= 15) return 'threshold'
    return 'tempo'
  }
  if (/\b(endurance|fondo|aerob|z2)\b/.test(raw)) return 'endurance'
  return null
}

export function resolveSessionKind(input: {
  type?: string | null
  title?: string | null
  description?: string | null
  zone?: string | null
}): SessionKind {
  const fromType = inferKindFromText(input.type) ?? (input.type as SessionKind | undefined)
  const fromText = inferKindFromText([input.title, input.description, input.zone].filter(Boolean).join(' '))
  const typed = fromType && fromType in KIND_RANK ? fromType : 'endurance'
  if (fromText && KIND_RANK[fromText] > KIND_RANK[typed]) return fromText
  if (typed !== 'endurance') return typed
  return fromText ?? 'endurance'
}

export function resolveSessionZone(input: {
  zone?: string | null
  title?: string | null
  description?: string | null
  kind?: string | null
}): string {
  if (input.kind === 'strength') return 'Fuerza'
  return (
    inferZoneFromText(input.title) ??
    inferZoneFromText(input.zone) ??
    inferZoneFromText(input.description) ??
    (input.kind === 'threshold' ? 'Z4' : input.kind === 'vo2max' ? 'Z5' : input.kind === 'tempo' ? 'Z3' : input.kind === 'recovery' ? 'Z1' : 'Z2')
  )
}

/** Turns "3x10m Z4/Sweet Spot" into a prescription the block parser understands. */
export function expandIntervalShorthand(title: string | null | undefined): string | null {
  const compact = parseCompactIntervals(title)
  if (!compact) return null
  return `${compact.repeats} bloques de ${compact.minutes} min en ${compact.intensity} con ${compact.restMinutes} min suaves entre cada uno`
}

export function looksGenericEnduranceText(text: string | null | undefined): boolean {
  const raw = (text ?? '').toLowerCase()
  return /ritmo constante en z2|mantener una conversaci[oó]n/.test(raw)
}
