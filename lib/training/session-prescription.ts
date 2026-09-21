export type SessionKind = 'recovery' | 'endurance' | 'long' | 'tempo' | 'threshold' | 'vo2max' | 'strength'

export type CompactIntervals = {
  repeats: number
  minutes: number
  intensity: string
  restMinutes: number
  /** True when the rest was stated in the text instead of inferred. */
  restExplicit: boolean
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
  const stated = parseRestMinutes(raw)
  const restMinutes = stated ?? (minutes <= 5 ? minutes : Math.max(3, Math.round(minutes / 2)))
  return { repeats, minutes, intensity, restMinutes, restExplicit: stated != null }
}

/**
 * Recovery between intervals as written by the coach: "recuperando 3m",
 * "3 min suaves entre series", "4x5m/3m". Without this the rest time gets
 * invented and the plan contradicts what the coach actually said.
 */
export function parseRestMinutes(text: string | null | undefined): number | null {
  const raw = (text ?? '').replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!raw.trim()) return null

  const patterns = [
    /(?:\d+\s*[x×]\s*\d+\s*m?(?:in)?)\s*[/(]\s*(\d+)\s*m?(?:in)?/i,
    /(?:recuper\w*|descanso|pausa|rec\.?|off)\s*(?:de|con|:)?\s*(\d+)\s*(?:m\b|min\b|minutos\b|')/i,
    /(\d+)\s*(?:m\b|min\b|minutos\b|')\s*(?:de\s+)?(?:recuper\w*|suaves?|faciles?|flojos?|off|entre\s+(?:series|bloques|cada))/i,
  ]

  for (const pattern of patterns) {
    const found = raw.match(pattern)
    if (found) {
      const value = Number(found[1])
      if (Number.isFinite(value) && value > 0 && value <= 30) return value
    }
  }
  return null
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

export function looksGroupRide(...texts: Array<string | null | undefined>): boolean {
  return /grupal|grupeta|con el grupo|salida de grupo|group ride/i.test(texts.filter(Boolean).join(' '))
}

export function inferKindFromText(text: string | null | undefined): SessionKind | null {
  const raw = (text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!raw.trim()) return null
  if (/\b(fuerza|strength|gym|gimnasio|core)\b/.test(raw)) return 'strength'
  // A range like Z3–Z5 is the ceiling of a group ride, not a VO2 session.
  const explicitVo2 = /vo2/.test(raw)
  const loneZ5 = /\bz5\b/.test(raw) && !/z[1-4]\s*[–-]\s*z5/.test(raw)
  if (explicitVo2 || (loneZ5 && !looksGroupRide(raw))) return 'vo2max'
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
  const resolved =
    fromText && KIND_RANK[fromText] > KIND_RANK[typed]
      ? fromText
      : typed !== 'endurance'
        ? typed
        : (fromText ?? 'endurance')
  // A stored "vo2max" type still wins unless the text is clearly a group ride.
  if (resolved === 'vo2max' && looksGroupRide(input.title, input.description) && !/vo2/i.test(`${input.title ?? ''} ${input.description ?? ''}`)) {
    return fromText && fromText !== 'vo2max' ? fromText : 'threshold'
  }
  return resolved
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

/**
 * Turns "3x10m Z4/Sweet Spot" into a prescription the block parser understands.
 * `context` (the coach's own prose) is where an explicit recovery time lives,
 * so pass it whenever it is available instead of inferring the rest.
 */
export function expandIntervalShorthand(
  title: string | null | undefined,
  context?: string | null
): string | null {
  const compact = parseCompactIntervals(title)
  if (!compact) return null
  const rest = compact.restExplicit ? compact.restMinutes : (parseRestMinutes(context) ?? compact.restMinutes)
  return `${compact.repeats} bloques de ${compact.minutes} min en ${compact.intensity} con ${rest} min suaves entre cada uno`
}

export function looksGenericEnduranceText(text: string | null | undefined): boolean {
  const raw = (text ?? '').toLowerCase()
  return /ritmo constante en z2|mantener una conversaci[oó]n/.test(raw)
}
