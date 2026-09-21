'use client'

import { useEffect, useState } from 'react'
import { buildLoadScale } from '@/lib/training/load-scale'

/** Same 52-week personal cuts the year heatmap uses. */
export function useLoadScale(): number[] {
  const [scale, setScale] = useState<number[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/training/load-history?days=364')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        const loads = (json?.loadTimeline ?? []).map((row: { dailyLoad?: number | null }) =>
          Math.round(row.dailyLoad ?? 0)
        )
        setScale(buildLoadScale(loads))
      })
      .catch(() => {
        if (!cancelled) setScale([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return scale
}
