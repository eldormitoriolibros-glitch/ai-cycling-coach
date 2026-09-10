'use client'

import { cn } from '@/lib/utils'
import {
  bandTone,
  type BandId,
  type MetricAssessment,
} from '@/lib/training/form-status'

function fmt(value: number | null): string {
  return value == null ? '—' : Math.round(value).toString()
}

export function FormMeter({ metric }: { metric: MetricAssessment }) {
  const tone = bandTone(metric.band)
  const pct = metric.position == null ? null : Math.round(metric.position * 100)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{metric.label}</p>
          <p className={cn('text-[11px] font-medium', tone.text)}>{metric.bandLabel}</p>
        </div>
        <p className={cn('text-xl font-bold tabular-nums leading-none', tone.text)}>{fmt(metric.value)}</p>
      </div>

      <div className="relative py-1.5">
        <div
          className="h-2.5 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, rgba(239,68,68,0.55) 0%, rgba(245,158,11,0.5) 28%, rgba(16,185,129,0.55) 55%, rgba(56,189,248,0.5) 78%, rgba(139,92,246,0.5) 100%)',
          }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          aria-label={metric.label}
        />
        {pct != null && (
          <span
            aria-hidden
            className={cn(
              'absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white bg-foreground shadow-[0_0_0_2px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.55)] dark:border-white dark:shadow-[0_0_0_2px_rgba(255,255,255,0.35),0_2px_10px_rgba(0,0,0,0.8)]',
              tone.bar
            )}
            style={{ left: `${pct}%` }}
          />
        )}
      </div>

      <p className="text-[10px] leading-snug text-muted">{metric.hint}</p>
    </div>
  )
}

export function FormStatusMeters({
  form,
  fitness,
  fatigue,
  ramp,
}: {
  form: MetricAssessment
  fitness: MetricAssessment
  fatigue: MetricAssessment
  ramp: MetricAssessment
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormMeter metric={form} />
      <FormMeter metric={fatigue} />
      <FormMeter metric={fitness} />
      <FormMeter metric={ramp} />
    </div>
  )
}

/** Compact summary chips for the collapsed section header. */
export function FormStatusChips({
  metrics,
}: {
  metrics: MetricAssessment[]
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map((m) => {
        const tone = bandTone(m.band)
        return (
          <div key={m.id} className={cn('rounded-lg px-2 py-1.5', tone.soft)}>
            <dt className="text-[10px] uppercase tracking-wide text-muted">{m.label}</dt>
            <dd className="flex items-baseline gap-1.5">
              <span className={cn('text-lg font-semibold tabular-nums', tone.text)}>{fmt(m.value)}</span>
              <span className={cn('truncate text-[10px] font-medium', tone.text)}>{m.bandLabel}</span>
            </dd>
            <MeterMini band={m.band} position={m.position} />
          </div>
        )
      })}
    </dl>
  )
}

function MeterMini({ band, position }: { band: BandId | null; position: number | null }) {
  const tone = bandTone(band)
  if (position == null) return <div className="mt-1.5 h-1 rounded-full bg-slate-500/20" />
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-red-500/40 via-emerald-400/45 to-sky-400/40">
      <span
        className={cn(
          'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:shadow-[0_0_0_1px_rgba(255,255,255,0.35)]',
          tone.bar
        )}
        style={{ left: `${Math.round(position * 100)}%` }}
      />
    </div>
  )
}
