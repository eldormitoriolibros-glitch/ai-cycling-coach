'use client'

import { cn } from '@/lib/utils'
import {
  bandTone,
  type BandId,
  type MetricAssessment,
} from '@/lib/training/form-status'
import { ArcGauge, FORM_GRADIENT } from './ArcGauge'

function fmt(value: number | null): string {
  return value == null ? '—' : Math.round(value).toString()
}

export function FormMeter({ metric }: { metric: MetricAssessment }) {
  const tone = bandTone(metric.band)

  return (
    <div className="rounded-xl bg-background/70 px-2 pb-2 pt-1">
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {metric.label}
      </p>
      <ArcGauge
        position={metric.position}
        value={fmt(metric.value)}
        caption={metric.bandLabel}
        color={tone.hex}
        gradient={FORM_GRADIENT}
        ticks={metric.ticks.map((tick) => tick.at)}
        label={metric.label}
      />
      <p className="px-1 text-center text-[10px] leading-snug text-muted">{metric.hint}</p>
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
    <div className="grid gap-3 sm:grid-cols-2">
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
              <span className={cn('text-xl font-semibold tabular-nums', tone.text)}>{fmt(m.value)}</span>
              <span className={cn('truncate text-xs font-medium', tone.text)}>{m.bandLabel}</span>
            </dd>
            <MeterMini band={m.band} position={m.position} label={m.label} />
          </div>
        )
      })}
    </dl>
  )
}

function MeterMini({
  band,
  position,
  label,
}: {
  band: BandId | null
  position: number | null
  label: string
}) {
  const tone = bandTone(band)
  const pct = position == null ? null : Math.round(position * 100)

  return (
    <div className="relative mt-2 h-3.5">
      <div
        className="h-2.5 rounded-full"
        style={{
          background:
            'linear-gradient(90deg, #ef4444 0%, #f59e0b 28%, #10b981 55%, #0ea5e9 78%, #8b5cf6 100%)',
        }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-label={label}
      />
      {pct != null ? (
        <span
          aria-hidden
          className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-white/90"
          style={{ left: `${pct}%`, backgroundColor: tone.hex }}
        />
      ) : null}
    </div>
  )
}
