/**
 * Build a small athlete profile from a PowerSummary.curve (90-day bests).
 * Pure functions only — no DB, no server-only imports.
 */
import type { CurvePoint } from './ftp'

export type AthleteProfile = {
  sprintPower: number | null
  anaerobicPower: number | null
  vo2maxPower: number | null
  thresholdPower: number | null
  endurancePower: number | null
  anaerobicReserveRatio: number | null
  enduranceRatio: number | null
  phenotype: string | null
  trends: {
    sprint: string | null
    anaerobic: string | null
    vo2max: string | null
    threshold: string | null
    endurance: string | null
  }
}

/** Build a compact athlete profile from a curve (current window) and an optional previous window for trends. */
export function buildAthleteProfile(current: CurvePoint[] | null | undefined, previous: CurvePoint[] | null | undefined): AthleteProfile {
  const map = new Map<number, number>()
  for (const p of current ?? []) map.set(p.duration, p.watts)

  const get = (d: number) => (map.has(d) ? map.get(d)! : null)

  const sprintPower = get(5)
  const anaerobicPower = get(60) // 1min
  const vo2maxPower = get(300) // 5min
  const thresholdPower = get(1200) // 20min
  const endurancePower = get(3600) // 60min

  const anaerobicReserveRatio =
    vo2maxPower && thresholdPower ? +(vo2maxPower / thresholdPower).toFixed(2) : null
  const enduranceRatio = endurancePower && thresholdPower ? +(endurancePower / thresholdPower).toFixed(2) : null

  let phenotype: string | null = null
  if (anaerobicReserveRatio && anaerobicReserveRatio > 1.15) phenotype = 'sprinter'
  else if (enduranceRatio && enduranceRatio > 0.82 && (!anaerobicReserveRatio || anaerobicReserveRatio < 1.08)) phenotype = 'diesel'
  else if (anaerobicReserveRatio && enduranceRatio) phenotype = 'all-rounder'

  function trendFor(duration: number, label: keyof AthleteProfile['trends']): string | null {
    if (!previous || !current) return null
    const cur = (current.find((c) => c.duration === duration)?.watts) ?? null
    const prev = (previous.find((c) => c.duration === duration)?.watts) ?? null
    if (cur === null || prev === null) return null
    const delta = (cur - prev) / prev
    if (delta > 0.03) return 'improving'
    if (delta < -0.03) return 'declining'
    return 'stable'
  }

  const trends = {
    sprint: trendFor(5, 'sprint'),
    anaerobic: trendFor(60, 'anaerobic'),
    vo2max: trendFor(300, 'vo2max'),
    threshold: trendFor(1200, 'threshold'),
    endurance: trendFor(3600, 'endurance'),
  }

  return {
    sprintPower: sprintPower ?? null,
    anaerobicPower: anaerobicPower ?? null,
    vo2maxPower: vo2maxPower ?? null,
    thresholdPower: thresholdPower ?? null,
    endurancePower: endurancePower ?? null,
    anaerobicReserveRatio,
    enduranceRatio,
    phenotype,
    trends,
  }
}

/** Format the profile into plain-text lines for the coach context. */
export function formatAthleteProfile(p: AthleteProfile): string[] {
  const parts: string[] = []
  if (p.sprintPower) parts.push(`sprint 5s: ${Math.round(p.sprintPower)} W`)
  if (p.anaerobicPower) parts.push(`anaeróbico 1min: ${Math.round(p.anaerobicPower)} W`)
  if (p.vo2maxPower) parts.push(`VO2max 5min: ${Math.round(p.vo2maxPower)} W`)
  if (p.thresholdPower) parts.push(`umbral 20min: ${Math.round(p.thresholdPower)} W`)
  if (p.endurancePower) parts.push(`fondo 60min: ${Math.round(p.endurancePower)} W`)

  const lines: string[] = []
  if (parts.length) lines.push(parts.join(' · '))

  const ratios: string[] = []
  if (p.anaerobicReserveRatio) ratios.push(`reserva anaeróbica: ${p.anaerobicReserveRatio}`)
  if (p.enduranceRatio) ratios.push(`ratio fondo: ${p.enduranceRatio}`)
  if (p.phenotype) ratios.push(`fenotipo: ${p.phenotype}`)
  if (ratios.length) lines.push(ratios.join(' · '))

  const tparts: string[] = []
  if (p.trends.sprint) tparts.push(`sprint ${p.trends.sprint}`)
  if (p.trends.vo2max) tparts.push(`VO2max ${p.trends.vo2max}`)
  if (p.trends.threshold) tparts.push(`umbral ${p.trends.threshold}`)
  if (p.trends.endurance) tparts.push(`fondo ${p.trends.endurance}`)
  if (tparts.length) lines.push(`tendencias (vs período anterior): ${tparts.join(' · ')}`)

  if (lines.length === 0) return ['sin datos de potencia suficientes para armar perfil']
  return lines
}

