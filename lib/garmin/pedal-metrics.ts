/** Session-level pedaling from a dual-sided power meter (Garmin Connect / FIT). */
export type PedalMetrics = {
  leftPct: number | null
  rightPct: number | null
  leftTe: number | null
  rightTe: number | null
  leftSmooth: number | null
  rightSmooth: number | null
  leftPhaseStart: number | null
  leftPhaseEnd: number | null
  rightPhaseStart: number | null
  rightPhaseEnd: number | null
}

const EMPTY: PedalMetrics = {
  leftPct: null,
  rightPct: null,
  leftTe: null,
  rightTe: null,
  leftSmooth: null,
  rightSmooth: null,
  leftPhaseStart: null,
  leftPhaseEnd: null,
  rightPhaseStart: null,
  rightPhaseEnd: null,
}

function clampPct(value: number): number | null {
  if (!Number.isFinite(value)) return null
  if (value < 0 || value > 100) return null
  return Math.round(value * 10) / 10
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * FIT `left_right_balance` is a uint8: bit 7 = "this % is the right side",
 * bits 0–6 = the percentage. Parsers sometimes already strip the flag.
 */
export function decodeLeftPercent(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'object') {
    const rec = value as { value?: unknown; right?: unknown }
    const pct = asNumber(rec.value)
    if (pct == null) return null
    return rec.right ? clampPct(100 - pct) : clampPct(pct)
  }
  if (typeof value === 'string' && value.includes('/')) {
    const left = Number(value.split('/')[0])
    return clampPct(left)
  }
  const n = asNumber(value)
  if (n == null) return null
  if (n > 100 && n <= 255) {
    const pct = n & 0x7f
    return n & 0x80 ? clampPct(100 - pct) : clampPct(pct)
  }
  if (n > 255 && n <= 10000) return clampPct(n / 100)
  return clampPct(n)
}

function firstNum(...values: unknown[]): number | null {
  for (const value of values) {
    const n = asNumber(value)
    if (n != null) return n
  }
  return null
}

function phasePair(value: unknown): { start: number | null; end: number | null } {
  if (Array.isArray(value) && value.length >= 2) {
    return { start: asNumber(value[0]), end: asNumber(value[1]) }
  }
  if (value && typeof value === 'object') {
    const rec = value as { start?: unknown; end?: unknown; begin?: unknown }
    return { start: asNumber(rec.start ?? rec.begin), end: asNumber(rec.end) }
  }
  return { start: null, end: null }
}

function mean(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((sum, v) => sum + v, 0) / nums.length
}

export function hasPedalData(metrics: PedalMetrics | null | undefined): boolean {
  if (!metrics) return false
  return Object.values(metrics).some((value) => value != null)
}

function withSides(metrics: PedalMetrics): PedalMetrics {
  const leftPct = metrics.leftPct != null ? clampPct(metrics.leftPct) : null
  const rightPct = metrics.rightPct != null ? clampPct(metrics.rightPct) : null
  if (leftPct != null && rightPct == null) {
    return { ...metrics, leftPct, rightPct: clampPct(100 - leftPct) }
  }
  if (rightPct != null && leftPct == null) {
    return { ...metrics, leftPct: clampPct(100 - rightPct), rightPct }
  }
  return { ...metrics, leftPct, rightPct }
}

export function pedalFromGarminList(activity: Record<string, any>): PedalMetrics | null {
  const leftPct =
    decodeLeftPercent(activity.leftBalance ?? activity.avgLeftBalance ?? activity.leftRightBalance) ??
    (activity.rightBalance != null || activity.avgRightBalance != null
      ? clampPct(100 - Number(activity.rightBalance ?? activity.avgRightBalance))
      : null)
  const rightPct = firstNum(activity.rightBalance, activity.avgRightBalance)
  const leftPhase = phasePair(activity.leftPowerPhase ?? activity.avgLeftPowerPhase)
  const rightPhase = phasePair(activity.rightPowerPhase ?? activity.avgRightPowerPhase)
  const metrics = withSides({
    leftPct,
    rightPct: rightPct != null ? clampPct(rightPct) : null,
    leftTe: firstNum(activity.leftTorqueEffectiveness, activity.avgLeftTorqueEffectiveness),
    rightTe: firstNum(activity.rightTorqueEffectiveness, activity.avgRightTorqueEffectiveness),
    leftSmooth: firstNum(activity.leftPedalSmoothness, activity.avgLeftPedalSmoothness),
    rightSmooth: firstNum(activity.rightPedalSmoothness, activity.avgRightPedalSmoothness),
    leftPhaseStart: leftPhase.start,
    leftPhaseEnd: leftPhase.end,
    rightPhaseStart: rightPhase.start,
    rightPhaseEnd: rightPhase.end,
  })
  return hasPedalData(metrics) ? metrics : null
}

export function pedalFromFit(
  session: Record<string, unknown>,
  records: Array<Record<string, unknown>>
): PedalMetrics | null {
  const recordLeft = mean(records.map((r) => decodeLeftPercent(r.left_right_balance ?? r.left_right_balance_100)))
  const leftPct =
    decodeLeftPercent(session.left_right_balance ?? session.left_right_balance_100) ?? recordLeft
  const leftPhase = phasePair(session.avg_left_power_phase ?? session.left_power_phase)
  const rightPhase = phasePair(session.avg_right_power_phase ?? session.right_power_phase)
  const metrics = withSides({
    leftPct,
    rightPct: null,
    leftTe:
      firstNum(
        session.avg_left_torque_effectiveness,
        session.left_torque_effectiveness,
        session.avgLeftTorqueEffectiveness
      ) ?? mean(records.map((r) => asNumber(r.left_torque_effectiveness ?? r.leftTorqueEffectiveness))),
    rightTe:
      firstNum(
        session.avg_right_torque_effectiveness,
        session.right_torque_effectiveness,
        session.avgRightTorqueEffectiveness
      ) ?? mean(records.map((r) => asNumber(r.right_torque_effectiveness ?? r.rightTorqueEffectiveness))),
    leftSmooth:
      firstNum(
        session.avg_left_pedal_smoothness,
        session.left_pedal_smoothness,
        session.avg_combined_pedal_smoothness,
        session.avgLeftPedalSmoothness
      ) ?? mean(records.map((r) => asNumber(r.left_pedal_smoothness ?? r.leftPedalSmoothness))),
    rightSmooth:
      firstNum(
        session.avg_right_pedal_smoothness,
        session.right_pedal_smoothness,
        session.avgRightPedalSmoothness
      ) ?? mean(records.map((r) => asNumber(r.right_pedal_smoothness ?? r.rightPedalSmoothness))),
    leftPhaseStart: leftPhase.start,
    leftPhaseEnd: leftPhase.end,
    rightPhaseStart: rightPhase.start,
    rightPhaseEnd: rightPhase.end,
  })
  return hasPedalData(metrics) ? metrics : null
}

/** Cycling 0° is top dead center; SVG 0° is 3 o'clock. */
export function polarOnClock(
  cx: number,
  cy: number,
  r: number,
  cyclingDeg: number
): { x: number; y: number } {
  const rad = ((cyclingDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function phaseSpanDegrees(start: number, end: number): number {
  const s = ((start % 360) + 360) % 360
  const e = ((end % 360) + 360) % 360
  return Math.round(e >= s ? e - s : 360 - s + e)
}

export function phaseArcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const s = ((start % 360) + 360) % 360
  const e = ((end % 360) + 360) % 360
  const span = e >= s ? e - s : 360 - s + e
  const from = polarOnClock(cx, cy, r, s)
  const to = polarOnClock(cx, cy, r, e)
  const large = span > 180 ? 1 : 0
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
}

export function balanceNote(leftPct: number): string {
  const delta = Math.round(leftPct - 50)
  if (Math.abs(delta) < 3) return 'Cerca de 50/50.'
  if (delta > 0) return `La izquierda aporta ${delta} puntos más.`
  return `La derecha aporta ${Math.abs(delta)} puntos más.`
}

export function pedalDetailItems(metrics: PedalMetrics | null | undefined): Array<{
  label: string
  value: string
}> {
  if (!hasPedalData(metrics)) return []
  const items: Array<{ label: string; value: string }> = []
  if (metrics!.leftPct != null && metrics!.rightPct != null) {
    items.push({ label: 'Balance I / D', value: `${Math.round(metrics!.leftPct)} / ${Math.round(metrics!.rightPct)} %` })
  }
  if (metrics!.leftTe != null || metrics!.rightTe != null) {
    items.push({
      label: 'Efectividad I / D',
      value: `${metrics!.leftTe != null ? Math.round(metrics!.leftTe) : '—'} / ${metrics!.rightTe != null ? Math.round(metrics!.rightTe) : '—'} %`,
    })
  }
  if (metrics!.leftSmooth != null || metrics!.rightSmooth != null) {
    items.push({
      label: 'Suavidad I / D',
      value: `${metrics!.leftSmooth != null ? Math.round(metrics!.leftSmooth) : '—'} / ${metrics!.rightSmooth != null ? Math.round(metrics!.rightSmooth) : '—'} %`,
    })
  }
  if (metrics!.leftPhaseStart != null && metrics!.leftPhaseEnd != null) {
    const right =
      metrics!.rightPhaseStart != null && metrics!.rightPhaseEnd != null
        ? ` · D ${Math.round(metrics!.rightPhaseStart)}–${Math.round(metrics!.rightPhaseEnd)}°`
        : ''
    items.push({
      label: 'Fase de pedaleo',
      value: `I ${Math.round(metrics!.leftPhaseStart)}–${Math.round(metrics!.leftPhaseEnd)}°${right}`,
    })
  }
  return items
}

export function formatPedalMetrics(metrics: PedalMetrics): string {
  const parts: string[] = []
  if (metrics.leftPct != null && metrics.rightPct != null) {
    parts.push(`I ${Math.round(metrics.leftPct)} / D ${Math.round(metrics.rightPct)}`)
  }
  if (metrics.leftTe != null || metrics.rightTe != null) {
    parts.push(
      `TE ${metrics.leftTe != null ? Math.round(metrics.leftTe) : '—'} / ${metrics.rightTe != null ? Math.round(metrics.rightTe) : '—'}`
    )
  }
  if (metrics.leftSmooth != null || metrics.rightSmooth != null) {
    parts.push(
      `suave ${metrics.leftSmooth != null ? Math.round(metrics.leftSmooth) : '—'} / ${metrics.rightSmooth != null ? Math.round(metrics.rightSmooth) : '—'}`
    )
  }
  if (metrics.leftPhaseStart != null && metrics.leftPhaseEnd != null) {
    const right =
      metrics.rightPhaseStart != null && metrics.rightPhaseEnd != null
        ? ` / D ${Math.round(metrics.rightPhaseStart)}–${Math.round(metrics.rightPhaseEnd)}°`
        : ''
    parts.push(`fase I ${Math.round(metrics.leftPhaseStart)}–${Math.round(metrics.leftPhaseEnd)}°${right}`)
  }
  return parts.join(' · ')
}

export function summarizePedalTrend(
  rides: Array<{ date: string; metrics: PedalMetrics }>
): string[] {
  const withBalance = rides.filter((ride) => ride.metrics.leftPct != null)
  if (withBalance.length === 0) return []

  const lines = ['## Pedaleo (potenciómetro dual)']
  for (const ride of rides.slice(0, 6)) {
    const line = formatPedalMetrics(ride.metrics)
    if (line) lines.push(`- ${ride.date}: ${line}`)
  }

  if (withBalance.length < 2) {
    lines.push(
      'Con una sola salida no se arma tendencia. Si el desbalance se repite, en fuerza priorizá unilateral del lado que aporta menos.'
    )
    return lines
  }

  const meanLeft =
    withBalance.reduce((sum, ride) => sum + (ride.metrics.leftPct ?? 50), 0) / withBalance.length
  const delta = Math.round((meanLeft - 50) * 10) / 10
  if (Math.abs(delta) < 3) {
    lines.push(
      `Balance estable cerca de 50/50 (I ${meanLeft.toFixed(1)}%). No hace falta sesgar la fuerza por pedaleo.`
    )
    return lines
  }

  const weak = delta < 0 ? 'izquierda' : 'derecha'
  const strong = delta < 0 ? 'derecha' : 'izquierda'
  lines.push(
    `Tendencia: la ${strong} aporta ~${Math.abs(delta)} pp más (I ${meanLeft.toFixed(1)} / D ${(100 - meanLeft).toFixed(1)}). En fuerza priorizá unilateral del lado ${weak} (step-up, split squat, peso muerto a una pierna) y, si hay rodillo, series a una pierna en Z2. No es un diagnóstico: si duele, adaptá.`
  )
  return lines
}

export { EMPTY as EMPTY_PEDAL_METRICS }
