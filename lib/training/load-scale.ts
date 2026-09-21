/**
 * Personal load scale shared by the year heatmap and the calendar.
 * Dark means hard for this athlete, not against a generic TSS table.
 */

export const LOAD_LEVEL_OPACITY = [0, 0.22, 0.42, 0.62, 0.82, 1] as const

export function buildLoadScale(loads: number[]): number[] {
  const sorted = loads.filter((v) => v > 0).sort((a, b) => a - b)
  if (!sorted.length) return []
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return [at(0.2), at(0.45), at(0.7), at(0.9)]
}

export function loadLevel(load: number, scale: number[]): number {
  if (load <= 0 || !scale.length) return 0
  for (let i = 0; i < scale.length; i++) {
    if (load <= scale[i]) return i + 1
  }
  return scale.length + 1
}

export function loadFill(level: number): string {
  if (level <= 0) return 'rgb(var(--border-rgb))'
  const opacity = LOAD_LEVEL_OPACITY[level] ?? 1
  return `rgb(var(--accent-500) / ${opacity})`
}

/** Light fills need dark type; the two darkest steps can take white. */
export function loadTextClass(level: number): string {
  return level >= 4 ? 'text-white' : 'text-foreground'
}
