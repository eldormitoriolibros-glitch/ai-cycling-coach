'use client'

import { useId } from 'react'

/** Horseshoe: open at the bottom, 240° sweep, clockwise from the left. */
const START = 150
const SWEEP = 240

export const FORM_GRADIENT = [
  { offset: '0%', color: '#ef4444' },
  { offset: '28%', color: '#f59e0b' },
  { offset: '55%', color: '#10b981' },
  { offset: '78%', color: '#0ea5e9' },
  { offset: '100%', color: '#8b5cf6' },
] as const

export type GaugeStop = { offset: string; color: string }

type Geom = { cx: number; cy: number; r: number }

function point(geom: Geom, t: number, r = geom.r): { x: number; y: number } {
  const rad = ((START + SWEEP * t) * Math.PI) / 180
  return { x: geom.cx + r * Math.cos(rad), y: geom.cy + r * Math.sin(rad) }
}

function arcPath(geom: Geom, t0: number, t1: number, r = geom.r): string {
  const start = point(geom, t0, r)
  const end = point(geom, t1, r)
  const sweep = SWEEP * Math.max(0, t1 - t0)
  const large = sweep > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}

export function ArcGauge({
  position,
  value,
  caption,
  color,
  gradient,
  ticks = [],
  label,
}: {
  position: number | null
  value: string
  caption?: string
  color: string
  gradient: readonly GaugeStop[]
  ticks?: number[]
  label: string
}) {
  const uid = useId()
  const gradId = `${uid}-grad`
  const glowId = `${uid}-glow`
  const t = position == null ? null : Math.min(1, Math.max(0, position))
  const geom = { cx: 80, cy: 74, r: 56 }
  const needle = t == null ? null : point(geom, t)
  const inner = t == null ? null : point(geom, t, geom.r - 16)

  return (
    <div className="relative mx-auto w-full max-w-[200px]">
      <svg
        viewBox="0 0 160 112"
        className="w-full"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={t == null ? undefined : Math.round(t * 100)}
        aria-label={label}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            {gradient.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={arcPath(geom, 0, 1)}
          fill="none"
          stroke="rgb(var(--border-rgb))"
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.7}
        />
        <path
          d={arcPath(geom, 0, 1)}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={10}
          strokeLinecap="round"
        />

        {ticks.map((tick) => {
          const clamped = Math.min(1, Math.max(0, tick))
          const a = point(geom, clamped, geom.r + 8)
          const b = point(geom, clamped, geom.r + 2)
          return (
            <line
              key={tick}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgb(var(--muted-rgb))"
              strokeWidth={1.2}
              opacity={0.55}
            />
          )
        })}

        {t != null && needle && inner ? (
          <g filter={`url(#${glowId})`}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={needle.x}
              y2={needle.y}
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <circle
              cx={needle.x}
              cy={needle.y}
              r={6}
              fill={color}
              stroke="rgb(var(--surface-rgb))"
              strokeWidth={2}
            />
          </g>
        ) : null}

        <text
          x={geom.cx}
          y={caption ? 86 : 90}
          textAnchor="middle"
          fill={color}
          fontSize={22}
          fontWeight={700}
          className="tabular-nums"
        >
          {value}
        </text>
        {caption ? (
          <text
            x={geom.cx}
            y={102}
            textAnchor="middle"
            fill={color}
            fontSize={9}
            fontWeight={600}
          >
            {caption.length > 18 ? `${caption.slice(0, 17)}…` : caption}
          </text>
        ) : null}
      </svg>
    </div>
  )
}
