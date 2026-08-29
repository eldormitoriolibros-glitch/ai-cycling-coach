export function formatCalendarDistance(meters: number | null): string {
  if (!meters) return ''
  const km = meters / 1000
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`
}

/** Compact km label for activity bubbles (e.g. "52" or "129"). */
export function formatKmBubble(meters: number | null): string {
  if (!meters) return ''
  const km = meters / 1000
  return km >= 100 ? String(Math.round(km)) : km >= 10 ? km.toFixed(1) : km.toFixed(1)
}

export function formatCalendarDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatCalendarDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h} h ${m} min`
  if (h > 0) return `${h} h`
  return `${m} min`
}
