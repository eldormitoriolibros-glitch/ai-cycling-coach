'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { ReadinessResult } from '@/lib/training/readiness'

const SOURCE_LABEL: Record<string, string> = {
  garmin: 'Garmin',
  declarado: 'cargado a mano',
  carga: 'solo carga de entrenamiento',
  'sin datos': 'sin datos',
}

const ZONES = [
  { from: 0, to: 0.35, color: '#ef4444' },
  { from: 0.35, to: 0.5, color: '#f59e0b' },
  { from: 0.5, to: 0.7, color: '#0ea5e9' },
  { from: 0.7, to: 1, color: '#10b981' },
] as const

function tone(score: number): { text: string; hex: string } {
  if (score >= 70) return { text: 'text-emerald-500', hex: '#10b981' }
  if (score >= 50) return { text: 'text-sky-500', hex: '#0ea5e9' }
  if (score >= 35) return { text: 'text-amber-500', hex: '#f59e0b' }
  return { text: 'text-red-500', hex: '#ef4444' }
}

function polar(cx: number, cy: number, r: number, t: number) {
  const rad = ((-90 + t * 360) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, t0: number, t1: number) {
  const start = polar(cx, cy, r, t0)
  const end = polar(cx, cy, r, t1)
  const sweep = (t1 - t0) * 360
  const large = sweep > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}

/**
 * Readiness is a charge, not a spectrum. The ring fills from midnight toward
 * a full tank; the inner ticks are the same 35 / 50 / 70 cuts the label uses.
 */
export function ReadinessMeter({ readiness }: { readiness: ReadinessResult }) {
  const t = tone(readiness.score)
  const sources = readiness.dataSources.map((s) => SOURCE_LABEL[s] ?? s).join(' + ')
  const filled = Math.min(1, Math.max(0, readiness.score / 100))
  const uid = useId()
  const glowId = `${uid}-glow`
  const cx = 80
  const cy = 80
  const tip = polar(cx, cy, 58, filled)

  return (
    <div className="rounded-xl bg-background/70 px-4 py-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        Readiness (hoy)
      </p>

      <div className="relative mx-auto mt-1 w-full max-w-[220px]">
        <svg viewBox="0 0 160 160" className="w-full" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.score} aria-label="Readiness">
          <defs>
            <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx={cx}
            cy={cy}
            r={58}
            fill="none"
            stroke="rgb(var(--border-rgb))"
            strokeWidth={12}
            opacity={0.7}
          />

          {ZONES.map((zone) => (
            <path
              key={zone.color}
              d={arcPath(cx, cy, 46, zone.from, zone.to)}
              fill="none"
              stroke={zone.color}
              strokeWidth={3.5}
              strokeLinecap="butt"
              opacity={0.45}
            />
          ))}

          {filled > 0 ? (
            <g filter={`url(#${glowId})`}>
              {filled >= 0.999 ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={58}
                  fill="none"
                  stroke={t.hex}
                  strokeWidth={12}
                />
              ) : (
                <path
                  d={arcPath(cx, cy, 58, 0, Math.max(filled, 0.012))}
                  fill="none"
                  stroke={t.hex}
                  strokeWidth={12}
                  strokeLinecap="round"
                />
              )}
              <circle
                cx={tip.x}
                cy={tip.y}
                r={6}
                fill={t.hex}
                stroke="rgb(var(--surface-rgb))"
                strokeWidth={2}
              />
            </g>
          ) : null}

          <text
            x={cx}
            y={76}
            textAnchor="middle"
            fill={t.hex}
            fontSize={36}
            fontWeight={700}
            className="tabular-nums"
          >
            {readiness.score}
          </text>
          <text
            x={cx}
            y={94}
            textAnchor="middle"
            fill="rgb(var(--muted-rgb))"
            fontSize={10}
            fontWeight={600}
          >
            / 100
          </text>
        </svg>
      </div>

      <p className={cn('mt-0.5 text-center text-sm font-medium', t.text)}>{readiness.label}</p>

      {readiness.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {readiness.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-[10px] leading-snug text-muted">
        Mezcla sueño, HRV, FC en reposo, estrés y sensaciones con tu forma. Fuente: {sources}.
      </p>
    </div>
  )
}
