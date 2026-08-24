export const DAY_MS = 86_400_000

/** `YYYY-MM-DD` for an instant, in a given timezone. Falls back to UTC. */
export function localDateKey(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(date)
  }
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  )

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )

  return asUtc - instant.getTime()
}

/**
 * Interprets a naive local timestamp (`2026-08-23 08:26:35`) as wall time in
 * `timeZone` and returns the real instant. Needed for exports that omit the
 * UTC offset, such as Garmin's activity CSV.
 */
export function zonedTimeToUtc(localTimestamp: string, timeZone: string): Date {
  const asIfUtc = new Date(`${localTimestamp.trim().replace(' ', 'T')}Z`)
  if (Number.isNaN(asIfUtc.getTime())) return asIfUtc

  try {
    return new Date(asIfUtc.getTime() - offsetMs(asIfUtc, timeZone))
  } catch {
    return asIfUtc
  }
}
