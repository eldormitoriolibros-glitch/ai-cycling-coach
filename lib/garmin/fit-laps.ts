export type FitLap = {
  lapIndex: number
  startOffsetSeconds: number | null
  elapsedSeconds: number | null
  movingSeconds: number | null
  distanceMeters: number | null
  avgSpeed: number | null
  maxSpeed: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  avgPower: number | null
  maxPower: number | null
  normalizedPower: number | null
  elevationGain: number | null
  elevationLoss: number | null
  calories: number | null
  avgTemperature: number | null
  lapTrigger: string | null
  intensity: string | null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** FIT timestamps come back as Date, epoch seconds, or ISO strings depending on the file. */
export function parseFitDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000
    const parsed = new Date(ms)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/**
 * Laps that belong to a session, in ride order. FIT stores them flat, so they
 * are filtered by the session window rather than by a parent reference.
 */
export function extractSessionLaps(
  laps: Array<Record<string, unknown>>,
  session: Record<string, unknown>
): FitLap[] {
  const sessionStart = parseFitDate(session.start_time)
  if (!sessionStart) return []

  const durationSeconds =
    readNumber(session.total_elapsed_time) ?? readNumber(session.total_timer_time) ?? 24 * 3600
  const windowStart = new Date(sessionStart.getTime() - 60_000)
  const windowEnd = new Date(sessionStart.getTime() + durationSeconds * 1000 + 60_000)

  const dated = laps
    .map((lap) => ({ lap, start: parseFitDate(lap.start_time) }))
    .filter((row): row is { lap: Record<string, unknown>; start: Date } => row.start !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const inWindow = dated.filter((row) => row.start >= windowStart && row.start <= windowEnd)
  // Some files stamp laps outside the session window (timezone or missing
  // session duration). If the window filter empties a file that clearly has
  // splits, keep them all rather than pretend the ride had none.
  const chosen = inWindow.length > 0 ? inWindow : dated

  return chosen.map((row, index) => {
    const lap = row.lap
    const elapsed = readNumber(lap.total_elapsed_time)
    const moving = readNumber(lap.total_timer_time)
    const ascent = readNumber(lap.total_ascent)
    const descent = readNumber(lap.total_descent)
    return {
      lapIndex: index + 1,
      startOffsetSeconds: Math.max(0, Math.round((row.start.getTime() - sessionStart.getTime()) / 1000)),
      elapsedSeconds: elapsed,
      movingSeconds: moving ?? elapsed,
      distanceMeters: readNumber(lap.total_distance),
      avgSpeed: readNumber(lap.avg_speed) ?? readNumber(lap.enhanced_avg_speed),
      maxSpeed: readNumber(lap.max_speed) ?? readNumber(lap.enhanced_max_speed),
      avgHr: readNumber(lap.avg_heart_rate),
      maxHr: readNumber(lap.max_heart_rate),
      avgCadence: readNumber(lap.avg_cadence),
      maxCadence: readNumber(lap.max_cadence),
      avgPower: readNumber(lap.avg_power),
      maxPower: readNumber(lap.max_power),
      normalizedPower: readNumber(lap.normalized_power),
      elevationGain: ascent,
      elevationLoss: descent,
      calories: readNumber(lap.total_calories),
      avgTemperature: readNumber(lap.avg_temperature),
      lapTrigger: readString(lap.lap_trigger),
      intensity: readString(lap.intensity),
    }
  })
}
