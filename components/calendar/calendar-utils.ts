export function getActivityColor(sportType: string | null): string {
  const s = (sportType ?? '').toLowerCase()
  if (s.includes('run')) return 'bg-green-500'
  if (s.includes('swim')) return 'bg-blue-400'
  if (s.includes('weight') || s.includes('strength')) return 'bg-yellow-500'
  return 'bg-orange-500'
}

export function getBubbleSize(distanceKm: number, variant: 'full' | 'compact' | 'mini' = 'full'): string {
  if (variant === 'mini') {
    if (distanceKm >= 100) return 'w-10 h-10 text-[7px]'
    if (distanceKm >= 60) return 'w-9 h-9 text-[7px]'
    if (distanceKm >= 30) return 'w-8 h-8 text-[7px]'
    if (distanceKm >= 10) return 'w-7 h-7 text-[6px]'
    return 'w-6 h-6 text-[6px]'
  }
  if (variant === 'compact') {
    if (distanceKm >= 60) return 'w-8 h-8 text-[8px]'
    if (distanceKm >= 30) return 'w-7 h-7 text-[8px]'
    if (distanceKm >= 10) return 'w-6 h-6 text-[7px]'
    return 'w-5 h-5 text-[7px]'
  }
  if (distanceKm >= 100) return 'w-20 h-20 text-xs'
  if (distanceKm >= 60) return 'w-16 h-16 text-xs'
  if (distanceKm >= 30) return 'w-14 h-14 text-[11px]'
  if (distanceKm >= 10) return 'w-12 h-12 text-[10px]'
  return 'w-10 h-10 text-[10px]'
}

export const CALENDAR_GRID_COLS = 'grid-cols-[1fr_repeat(7,1fr)_120px]' as const
export const CALENDAR_GRID_COLS_COMPACT = 'grid-cols-[72px_repeat(7,1fr)_80px]' as const
