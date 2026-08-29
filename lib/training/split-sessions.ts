const STRENGTH_HINT = /\b(fuerza|core|gym|gimnasio|movilidad|pesos?)\b/i
const BIKE_HINT = /\b(bici|bike|ride|fondo|z[1-5]|endurance|tempo|umbral|vo2)\b/i

export type SplitPart = {
  kind: 'bike' | 'strength'
  title: string
  duration_minutes: number
}

export function looksCombined(title: string | null | undefined): boolean {
  if (!title) return false
  return title.includes('+') && STRENGTH_HINT.test(title)
}

export function looksStrength(title: string | null | undefined, workoutType: string | null | undefined): boolean {
  if (workoutType === 'strength') return true
  if (!title) return false
  return STRENGTH_HINT.test(title) && !BIKE_HINT.test(title)
}

function minutesFromLabel(part: string): number | null {
  const match = part.match(/\((\d+)\s*m(?:in)?\)/i)
  if (!match) return null
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

function cleanTitle(part: string): string {
  return part.replace(/\s*\(\d+\s*m(?:in)?\)\s*/i, '').replace(/\s+/g, ' ').trim()
}

/**
 * Splits "Bici Z2 (60m) + Fuerza liviana (30m)" into two sessions so each can
 * have its own status. If only the total duration is known, fuerza gets 30 min
 * and the rest stays on the bike.
 */
export function splitCombinedSession(
  title: string,
  durationMinutes: number | null | undefined
): SplitPart[] | null {
  if (!looksCombined(title)) return null

  const chunks = title.split(/\s*\+\s*/).map((c) => c.trim()).filter(Boolean)
  if (chunks.length < 2) return null

  const parsed = chunks.map((chunk) => {
    const name = cleanTitle(chunk)
    return {
      title: name || chunk,
      minutes: minutesFromLabel(chunk),
      kind: STRENGTH_HINT.test(chunk) ? ('strength' as const) : ('bike' as const),
    }
  })

  const total = durationMinutes && durationMinutes > 0 ? durationMinutes : null
  const missing = parsed.filter((p) => p.minutes == null)

  if (missing.length) {
    for (const p of missing) {
      if (p.kind === 'strength') p.minutes = 30
    }
    const stillMissing = parsed.filter((p) => p.minutes == null)
    const used = parsed.reduce((s, p) => s + (p.minutes ?? 0), 0)
    const leftover = total != null ? Math.max(15, total - used) : 60
    const per = Math.round(leftover / Math.max(1, stillMissing.length))
    for (const p of stillMissing) p.minutes = per
  }

  return parsed.map((p) => ({
    kind: p.kind,
    title: p.title,
    duration_minutes: Math.min(600, Math.max(15, p.minutes ?? 30)),
  }))
}
