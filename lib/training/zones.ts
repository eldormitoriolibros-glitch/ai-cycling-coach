/**
 * Heart rate / power zone bounds and bucketing, shared between the client
 * chart component and the server-side coach context builder so both agree
 * on the exact same thresholds.
 */

export type ZoneBound = { zone: string; label: string; range: string; color: string }

/**
 * Heart rate zone boundaries using Strava/Garmin standard (10% bands).
 * Z1: <60%, Z2: 60-70%, Z3: 70-80%, Z4: 80-90%, Z5: 90%+ of max HR.
 */
export function getHrZoneBounds(maxHr: number | null): ZoneBound[] | null {
  if (!maxHr) return null

  const z1Max = Math.round(maxHr * 0.6)
  const z2Max = Math.round(maxHr * 0.7)
  const z3Max = Math.round(maxHr * 0.8)
  const z4Max = Math.round(maxHr * 0.9)

  return [
    { zone: 'Z1', label: 'Calentamiento', range: `<${z1Max}`, color: '#94a3b8' },
    { zone: 'Z2', label: 'Fondo', range: `${z1Max}-${z2Max}`, color: '#3b82f6' },
    { zone: 'Z3', label: 'Tempo', range: `${z2Max}-${z3Max}`, color: '#f59e0b' },
    { zone: 'Z4', label: 'Umbral', range: `${z3Max}-${z4Max}`, color: '#ef4444' },
    { zone: 'Z5', label: 'VO2máx', range: `>${z4Max}`, color: '#991b1b' },
  ]
}

/**
 * Power zone boundaries based on FTP. Strava/Garmin standard:
 * Z1: <56%, Z2: 56-75%, Z3: 75-90%, Z4: 90-105%, Z5+: 105%+ of FTP.
 */
export function getPowerZoneBounds(ftp: number | null): ZoneBound[] | null {
  if (!ftp) return null

  const z1Max = Math.round(ftp * 0.56)
  const z2Max = Math.round(ftp * 0.75)
  const z3Max = Math.round(ftp * 0.9)
  const z4Max = Math.round(ftp * 1.05)

  return [
    { zone: 'Z1', label: 'Recuperación', range: `<${z1Max}`, color: '#94a3b8' },
    { zone: 'Z2', label: 'Endurance', range: `${z1Max}-${z2Max}`, color: '#3b82f6' },
    { zone: 'Z3', label: 'Tempo', range: `${z2Max}-${z3Max}`, color: '#f59e0b' },
    { zone: 'Z4', label: 'Umbral', range: `${z3Max}-${z4Max}`, color: '#ef4444' },
    { zone: 'Z5+', label: 'Anaeróbico', range: `>${z4Max}`, color: '#991b1b' },
  ]
}

export type HrZoneCounts = { Z1: number; Z2: number; Z3: number; Z4: number; Z5: number }
export type PowerZoneCounts = { Z1: number; Z2: number; Z3: number; Z4: number; 'Z5+': number }

export function countHrZones(heartRates: Array<number | null>, maxHr: number | null): HrZoneCounts {
  const counts: HrZoneCounts = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 }
  if (!maxHr) return counts

  for (const hr of heartRates) {
    if (!hr) continue
    const pct = hr / maxHr
    if (pct < 0.6) counts.Z1++
    else if (pct < 0.7) counts.Z2++
    else if (pct < 0.8) counts.Z3++
    else if (pct < 0.9) counts.Z4++
    else counts.Z5++
  }

  return counts
}

export function countPowerZones(powers: Array<number | null>, ftp: number | null): PowerZoneCounts {
  const counts: PowerZoneCounts = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, 'Z5+': 0 }
  if (!ftp) return counts

  for (const power of powers) {
    if (!power) continue
    const pct = power / ftp
    if (pct < 0.56) counts.Z1++
    else if (pct < 0.75) counts.Z2++
    else if (pct < 0.9) counts.Z3++
    else if (pct < 1.05) counts.Z4++
    else counts['Z5+']++
  }

  return counts
}

/** Converts raw zone counts into a percentage distribution, e.g. for display or prose. */
export function zoneCountsToPercent<T extends Record<string, number>>(counts: T): Record<keyof T, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const result = {} as Record<keyof T, number>
  for (const key of Object.keys(counts) as Array<keyof T>) {
    result[key] = total > 0 ? Math.round((counts[key] / total) * 100) : 0
  }
  return result
}
