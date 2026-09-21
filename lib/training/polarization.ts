/**
 * Seiler 80/20: most of the week's time should sit easy (Z1–Z2). The rest is
 * hard (Z4–Z5). Z3 in the middle is the junk that eats recovery without
 * buying the adaptation.
 *
 * Pure functions only. Counts are seconds, not sample ticks — smart recording
 * is not 1 Hz.
 */
import { startOfWeek } from './dates'

export type HrZoneSeconds = { Z1: number; Z2: number; Z3: number; Z4: number; Z5: number }
export type PowerZoneSeconds = { Z1: number; Z2: number; Z3: number; Z4: number; Z5: number }

export type ZoneSeconds = {
  hr?: HrZoneSeconds
  power?: PowerZoneSeconds
}

export type PolarizationSample = {
  offset_seconds: number
  heart_rate?: number | null
  power?: number | null
}

export type PolarizationBand = {
  easy: number
  mid: number
  hard: number
}

export type PolarizationShares = {
  easy: number
  mid: number
  hard: number
}

export type PolarizationVerdict = 'polarized' | 'pyramidal' | 'threshold' | 'too-hard' | 'too-easy'

export type PolarizationWeek = {
  weekStart: string
  band: PolarizationBand
  shares: PolarizationShares
  metric: 'power' | 'hr'
  seconds: number
}

export const VERDICT_COPY: Record<PolarizationVerdict, { label: string; note: string }> = {
  polarized: {
    label: 'Polarizado',
    note: 'Cerca de 80% suave y un bloque intenso. El medio casi no existe. Así se sostiene un ciclo.',
  },
  pyramidal: {
    label: 'Piramidal',
    note: 'Hay más tempo que intenso. Sirve en bloques de umbral; no es el 80/20 clásico.',
  },
  threshold: {
    label: 'Mucho tempo',
    note: 'Z3 se comió la semana. Cansa como lo duro y no paga como lo duro.',
  },
  'too-hard': {
    label: 'Demasiado intenso',
    note: 'Más de un tercio de la semana en Z4–Z5. La base se achica y la absorción falla.',
  },
  'too-easy': {
    label: 'Casi todo suave',
    note: 'Falta el 20% que mueve el umbral. Un estímulo de calidad por semana alcanza.',
  },
}

const EMPTY_HR = (): HrZoneSeconds => ({ Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 })
const EMPTY_POWER = (): PowerZoneSeconds => ({ Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 })
const MAX_GAP_SECONDS = 5

export function hrZoneFor(hr: number, maxHr: number): keyof HrZoneSeconds {
  const pct = hr / maxHr
  if (pct < 0.6) return 'Z1'
  if (pct < 0.7) return 'Z2'
  if (pct < 0.8) return 'Z3'
  if (pct < 0.9) return 'Z4'
  return 'Z5'
}

export function powerZoneFor(watts: number, ftp: number): keyof PowerZoneSeconds {
  const pct = watts / ftp
  if (pct < 0.56) return 'Z1'
  if (pct < 0.75) return 'Z2'
  if (pct < 0.9) return 'Z3'
  if (pct < 1.05) return 'Z4'
  return 'Z5'
}

/** Time-weighted zone seconds from a ride. Gaps longer than 5 s are capped. */
export function zoneSecondsFromSamples(input: {
  samples: PolarizationSample[]
  maxHr: number | null
  ftp: number | null
}): ZoneSeconds {
  const samples = [...input.samples].sort((a, b) => a.offset_seconds - b.offset_seconds)
  const hr = input.maxHr ? EMPTY_HR() : undefined
  const power = input.ftp ? EMPTY_POWER() : undefined
  if (!samples.length || (!hr && !power)) return {}

  for (let i = 0; i < samples.length; i++) {
    const current = samples[i]
    const next = samples[i + 1]
    const dt = next
      ? Math.min(Math.max(next.offset_seconds - current.offset_seconds, 0), MAX_GAP_SECONDS)
      : 1
    if (dt <= 0) continue

    if (hr && input.maxHr && current.heart_rate && current.heart_rate > 0) {
      hr[hrZoneFor(current.heart_rate, input.maxHr)] += dt
    }
    if (power && input.ftp && current.power && current.power > 0) {
      power[powerZoneFor(current.power, input.ftp)] += dt
    }
  }

  const out: ZoneSeconds = {}
  if (hr && sumZones(hr) > 0) out.hr = hr
  if (power && sumZones(power) > 0) out.power = power
  return out
}

export function bandFromHr(zones: HrZoneSeconds): PolarizationBand {
  return {
    easy: zones.Z1 + zones.Z2,
    mid: zones.Z3,
    hard: zones.Z4 + zones.Z5,
  }
}

export function bandFromPower(zones: PowerZoneSeconds): PolarizationBand {
  return {
    easy: zones.Z1 + zones.Z2,
    mid: zones.Z3,
    hard: zones.Z4 + zones.Z5,
  }
}

export function bandFromZones(zones: ZoneSeconds, preferPower: boolean): PolarizationBand | null {
  if (preferPower && zones.power && sumZones(zones.power) > 0) return bandFromPower(zones.power)
  if (zones.hr && sumZones(zones.hr) > 0) return bandFromHr(zones.hr)
  if (zones.power && sumZones(zones.power) > 0) return bandFromPower(zones.power)
  return null
}

export function sharesOf(band: PolarizationBand): PolarizationShares | null {
  const total = band.easy + band.mid + band.hard
  if (total <= 0) return null
  return {
    easy: band.easy / total,
    mid: band.mid / total,
    hard: band.hard / total,
  }
}

export function polarizationVerdict(shares: PolarizationShares): PolarizationVerdict {
  if (shares.hard >= 0.33) return 'too-hard'
  if (shares.mid >= 0.2) return 'threshold'
  if (shares.easy >= 0.75 && shares.hard >= 0.1 && shares.mid < 0.15) return 'polarized'
  if (shares.easy >= 0.85 && shares.hard < 0.1) return 'too-easy'
  if (shares.mid > shares.hard) return 'pyramidal'
  if (shares.easy >= 0.7 && shares.hard >= 0.12) return 'polarized'
  return 'pyramidal'
}

export function addBands(a: PolarizationBand, b: PolarizationBand): PolarizationBand {
  return {
    easy: a.easy + b.easy,
    mid: a.mid + b.mid,
    hard: a.hard + b.hard,
  }
}

export function emptyBand(): PolarizationBand {
  return { easy: 0, mid: 0, hard: 0 }
}

export function rollupPolarizationWeeks(
  rides: Array<{ date: string; zones: ZoneSeconds }>,
  preferPower: boolean
): PolarizationWeek[] {
  const byWeek = new Map<string, { hr: PolarizationBand; power: PolarizationBand }>()

  for (const ride of rides) {
    const weekStart = startOfWeek(ride.date)
    const bucket = byWeek.get(weekStart) ?? { hr: emptyBand(), power: emptyBand() }
    if (ride.zones.hr) bucket.hr = addBands(bucket.hr, bandFromHr(ride.zones.hr))
    if (ride.zones.power) bucket.power = addBands(bucket.power, bandFromPower(ride.zones.power))
    byWeek.set(weekStart, bucket)
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([weekStart, bucket]) => {
      const usePower =
        preferPower && bucket.power.easy + bucket.power.mid + bucket.power.hard > 0
      const band = usePower ? bucket.power : bucket.hr
      const shares = sharesOf(band)
      const seconds = band.easy + band.mid + band.hard
      if (!shares || seconds <= 0) return []
      return [
        {
          weekStart,
          band,
          shares,
          metric: usePower ? 'power' : 'hr',
          seconds,
        },
      ]
    })
}

function sumZones(zones: Record<string, number>): number {
  return Object.values(zones).reduce((sum, value) => sum + value, 0)
}
