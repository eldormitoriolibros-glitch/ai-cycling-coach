/**
 * Heart rate / power zone bounds and bucketing, shared between the client
 * chart component and the server-side coach context builder so both agree
 * on the exact same thresholds.
 */

export type ZoneBound = { zone: string; label: string; range: string; color: string }

/** One palette for every zone chart, so Z4 is the same colour everywhere. */
export const ZONE_COLORS: Record<string, string> = {
  Z1: '#94a3b8',
  Z2: '#3b82f6',
  Z3: '#22c55e',
  Z4: '#f97316',
  Z5: '#ef4444',
  Z6: '#b91c1c',
}

/** Fraction of FTP covered by each zone (Coggan). `null` means open-ended. */
const POWER_ZONE_FRACTIONS: Record<string, [number, number | null]> = {
  Z1: [0, 0.56],
  Z2: [0.56, 0.75],
  Z3: [0.75, 0.9],
  Z4: [0.9, 1.05],
  Z5: [1.05, 1.2],
  Z6: [1.2, null],
}

/** Fraction of max HR covered by each zone (Strava/Garmin 10% bands). */
const HR_ZONE_FRACTIONS: Record<string, [number, number | null]> = {
  Z1: [0, 0.6],
  Z2: [0.6, 0.7],
  Z3: [0.7, 0.8],
  Z4: [0.8, 0.9],
  Z5: [0.9, null],
  Z6: [0.9, null],
}

/**
 * Zone ids named by a prescription: "Z1–Z2" → [Z1, Z2], "FTP / Z4" → [Z4].
 * Coaches also write intensities by name, so those map onto the same scale.
 */
export function zonesInText(text: string | null | undefined): string[] {
  const raw = (text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!raw.trim()) return []

  const found = new Set<string>()
  for (const match of raw.matchAll(/z\s*([1-6])/g)) found.add(`Z${match[1]}`)
  if (!found.size) {
    if (/sweet\s*spot|ftp|umbral|threshold/.test(raw)) found.add('Z4')
    else if (/vo2|fuerte/.test(raw)) found.add('Z5')
    else if (/tempo/.test(raw)) found.add('Z3')
    else if (/recuper|regen|suave/.test(raw)) found.add('Z1')
  }
  return [...found].sort()
}

export function zoneColor(zone: string | null | undefined): string {
  const ids = zonesInText(zone)
  return ZONE_COLORS[ids[ids.length - 1] ?? ''] ?? ZONE_COLORS.Z1
}

function targetFrom(
  fractions: Record<string, [number, number | null]>,
  zone: string | null | undefined,
  reference: number | null
): { low: number; high: number | null } | null {
  if (!reference) return null
  const ids = zonesInText(zone).filter((id) => id in fractions)
  if (!ids.length) return null

  const low = Math.min(...ids.map((id) => fractions[id][0]))
  const highs = ids.map((id) => fractions[id][1])
  const high = highs.some((v) => v == null) ? null : Math.max(...(highs as number[]))
  return { low: Math.round(low * reference), high: high == null ? null : Math.round(high * reference) }
}

/** Watt band a prescribed zone maps to, e.g. "Z4" at 250 W FTP → 225–263 W. */
export function powerTargetFor(zone: string | null | undefined, ftp: number | null) {
  return targetFrom(POWER_ZONE_FRACTIONS, zone, ftp)
}

/** Heart rate band a prescribed zone maps to. */
export function hrTargetFor(zone: string | null | undefined, maxHr: number | null) {
  return targetFrom(HR_ZONE_FRACTIONS, zone, maxHr)
}

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
    { zone: 'Z1', label: 'Calentamiento', range: `<${z1Max}`, color: ZONE_COLORS.Z1 },
    { zone: 'Z2', label: 'Fondo', range: `${z1Max}-${z2Max}`, color: ZONE_COLORS.Z2 },
    { zone: 'Z3', label: 'Tempo', range: `${z2Max}-${z3Max}`, color: ZONE_COLORS.Z3 },
    { zone: 'Z4', label: 'Umbral', range: `${z3Max}-${z4Max}`, color: ZONE_COLORS.Z4 },
    { zone: 'Z5', label: 'VO2máx', range: `>${z4Max}`, color: ZONE_COLORS.Z5 },
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
    { zone: 'Z1', label: 'Recuperación', range: `<${z1Max}`, color: ZONE_COLORS.Z1 },
    { zone: 'Z2', label: 'Endurance', range: `${z1Max}-${z2Max}`, color: ZONE_COLORS.Z2 },
    { zone: 'Z3', label: 'Tempo', range: `${z2Max}-${z3Max}`, color: ZONE_COLORS.Z3 },
    { zone: 'Z4', label: 'Umbral', range: `${z3Max}-${z4Max}`, color: ZONE_COLORS.Z4 },
    { zone: 'Z5+', label: 'Anaeróbico', range: `>${z4Max}`, color: ZONE_COLORS.Z5 },
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
