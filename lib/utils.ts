import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Postgres `time` comes back as `HH:MM:SS`; `<input type="time">` wants `HH:MM`. */
export function toTimeInput(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const [h, m] = value.split(':')
  if (h === undefined || m === undefined) return fallback
  return `${h.padStart(2, '0')}:${m}`
}

/** Inverse of `toTimeInput`. */
export function toPgTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value
}

export function parseIntOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  return Number.isFinite(n) ? n : null
}

export function parseFloatOrNull(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const n = Number.parseFloat(trimmed)
  return Number.isFinite(n) ? n : null
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatDistance(meters: number | null | undefined): string {
  if (!meters) return '—'
  return `${(meters / 1000).toFixed(1)} km`
}
