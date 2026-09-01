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
  if (distanceKm >= 100) return 'w-14 h-14 text-[10px]'
  if (distanceKm >= 60) return 'w-12 h-12 text-[10px]'
  if (distanceKm >= 30) return 'w-11 h-11 text-[10px]'
  if (distanceKm >= 10) return 'w-10 h-10 text-[10px]'
  return 'w-9 h-9 text-[9px]'
}

/** 7 equal days on small screens; week label + days + weekly total from md up. */
export const CALENDAR_WEEK_GRID =
  'grid grid-cols-7 gap-x-1 md:grid-cols-[minmax(6.75rem,0.9fr)_repeat(7,minmax(0,1fr))_minmax(5.5rem,0.7fr)] md:gap-x-0' as const

export const CALENDAR_WEEK_GRID_COMPACT = 'grid grid-cols-7 gap-x-1' as const
