import { addDays } from './dates'
import type { DailyLoadPoint } from './rollup'

export type ProjectedPoint = {
  date: string
  chronic_load: number
  acute_load: number
  form: number
}

const CHRONIC_DAYS = 42
const ACUTE_DAYS = 7

export function projectLoad(lastPoint: DailyLoadPoint, days: number, dailyLoads: number[]): ProjectedPoint[] {
  const out: ProjectedPoint[] = []
  let chronic = lastPoint.chronic_load ?? 0
  let acute = lastPoint.acute_load ?? 0
  const start = lastPoint.date

  for (let i = 0; i < days; i++) {
    const load = dailyLoads[i] ?? 0
    chronic += (load - chronic) / CHRONIC_DAYS
    acute += (load - acute) / ACUTE_DAYS
    const form = chronic - acute
    out.push({
      date: addDays(start, i + 1),
      chronic_load: Math.round(chronic),
      acute_load: Math.round(acute),
      form: Math.round(form),
    })
  }
  return out
}

export function formatProjection(scenarios: { label: string; points: ProjectedPoint[] }[]): string[] {
  const lines: string[] = []
  for (const s of scenarios) {
    if (!s.points.length) continue
    const last = s.points[s.points.length - 1]
    lines.push(`proyección a ${s.points.length} días (${s.label}): fitness ${Math.round(last.chronic_load)} · fatiga ${Math.round(last.acute_load)} · forma ${Math.round(last.form)}`)
  }
  return lines
}

