'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { YearVolume } from '@/lib/training/volume-yoy'
import { cn } from '@/lib/utils'

export function YearVolumeChart({ compact = false }: { compact?: boolean }) {
  const [volume, setVolume] = useState<YearVolume | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/training/volume-yoy')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && !json.error) setVolume(json)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!volume || volume.thisYearHours + volume.lastYearHours === 0) return null

  const delta = volume.thisYearHours - volume.lastYearToDateHours
  const deltaPct =
    volume.lastYearToDateHours > 0 ? Math.round((delta / volume.lastYearToDateHours) * 100) : null

  return (
    <div className={cn('space-y-3', compact && 'rounded-lg border border-surface p-3')}>
      <div>
        <h3 className={compact ? 'text-xs font-semibold uppercase tracking-wide' : 'font-semibold'}>
          Horas {volume.year} vs {volume.year - 1}
        </h3>
        {!compact ? (
          <p className="mt-1 text-xs text-muted">
            Tiempo en movimiento, mes a mes. La comparación «hasta hoy» corta el año pasado en el
            último mes que ya entrenaste este año.
          </p>
        ) : null}
        <p className="mt-1 text-sm font-semibold tabular-nums">
          {volume.thisYearHours.toFixed(0)} h este año
          {deltaPct != null ? (
            <span className="ml-2 text-xs font-normal text-muted">
              {delta > 0 ? '+' : ''}
              {delta.toFixed(0)} h ({deltaPct > 0 ? '+' : ''}
              {deltaPct}%) vs el mismo tramo de {volume.year - 1}
            </span>
          ) : null}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={compact ? 160 : 220}>
        <ComposedChart data={volume.months} barSize={compact ? 8 : 12}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: compact ? 8 : 10 }} />
          <YAxis tick={{ fontSize: compact ? 8 : 10 }} width={compact ? 24 : 32} unit="h" />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as YearVolume['months'][number]
              return (
                <div className="rounded-lg border border-surface bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium">{row.label}</p>
                  <p>
                    {volume.year}: {row.thisYearHours.toFixed(1)} h
                  </p>
                  <p>
                    {volume.year - 1}: {row.lastYearHours.toFixed(1)} h
                  </p>
                </div>
              )
            }}
          />
          {!compact ? (
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => (value === 'thisYearHours' ? String(volume.year) : String(volume.year - 1))}
            />
          ) : null}
          <Bar dataKey="lastYearHours" fill="#94a3b8" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
          <Bar dataKey="thisYearHours" fill="rgb(var(--accent-500))" radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
