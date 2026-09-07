'use client'

import { useState } from 'react'
import type { WorkoutStatus } from '@/lib/types/database'
import { looksStrength } from '@/lib/training/split-sessions'
import { blocksForBikeSession, strengthExercises } from '@/lib/training/workout-blocks'
import { considerationsFor, SESSION_KIND_OPTIONS } from '@/lib/training/session-notes'
import {
  expandIntervalShorthand,
  looksGenericEnduranceText,
  resolveSessionKind,
  resolveSessionZone,
} from '@/lib/training/session-prescription'
import { formatBikeDescription } from '@/lib/training/workout-blocks'

export type PlanSession = {
  id?: string
  scheduled_date?: string
  workout_type?: string | null
  title: string | null
  description: string | null
  duration_minutes: number | null
  target_zone: string | null
  target_power?: number | null
  target_hr?: number | null
  purpose: string | null
  rationale?: string | null
  status?: WorkoutStatus
  estimated_load?: number | null
}

const STATUS_LABEL: Record<WorkoutStatus, string> = {
  scheduled: 'Programado',
  completed: 'Hecho',
  skipped: 'Saltado',
  moved: 'Movido',
}

function statusClass(status: WorkoutStatus): string {
  if (status === 'completed') return 'bg-green-100 text-green-800'
  if (status === 'skipped') return 'bg-slate-100 text-slate-500'
  return 'bg-blue-100 text-blue-800'
}

function kindLabel(kind: string | null | undefined): string {
  return SESSION_KIND_OPTIONS.find((k) => k.id === kind)?.label ?? (kind === 'strength' ? 'Fuerza' : 'Bici')
}

export function SessionCard({
  session,
  past,
  defaultOpen = false,
  extra,
  actions,
}: {
  session: PlanSession
  past?: boolean
  defaultOpen?: boolean
  extra?: string | null
  actions?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const kind = resolveSessionKind({
    type: session.workout_type,
    title: session.title,
    description: session.description,
    zone: session.target_zone,
  })
  const zone = resolveSessionZone({
    zone: session.target_zone,
    title: session.title,
    description: session.description,
    kind,
  })
  const strength = looksStrength(session.title, kind)
  const bikeBlocks = strength
    ? []
    : blocksForBikeSession({
        description: session.description,
        minutes: session.duration_minutes,
        zone,
        kind,
        title: session.title,
      })
  const strengthRows = strength ? strengthExercises(session.description) : []
  const tip = considerationsFor(kind)
  const fromTitle = expandIntervalShorthand(session.title)
  const description =
    fromTitle && looksGenericEnduranceText(session.description)
      ? formatBikeDescription({
          kind,
          totalMinutes: session.duration_minutes ?? 60,
          zone,
          mainWork: fromTitle,
        })
      : session.description
  const purpose =
    kind === 'threshold' && /base aer/i.test(session.purpose ?? '')
      ? 'Empujar el FTP: bloques de calidad en Z4 / Sweet Spot, no un rodaje de conversación.'
      : session.purpose

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${past ? 'opacity-70' : ''} ${
        strength ? 'border-amber-400/40 bg-amber-50/5' : 'border-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={() => setOpen((v) => !v)}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                strength
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-accent-500/15 text-accent-700 dark:text-accent-300'
              }`}
            >
              {strength ? 'Fuerza' : 'Bici'}
            </span>
            <p className="text-sm font-medium text-foreground">{session.title ?? 'Sesión'}</p>
          </div>
          <p className="mt-1 text-xs text-muted">
            {session.duration_minutes != null ? `${session.duration_minutes} min` : '—'}
            {zone ? ` · ${zone}` : ''}
            {session.target_power != null ? ` · ${session.target_power} W` : ''}
            {extra ? ` · carga ${extra.replace(/^carga\s+/i, '')}` : ''}
            <span className="ml-2 text-accent-600 dark:text-accent-400">
              {open ? 'Ocultar detalle' : 'Ver diseño'}
            </span>
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {session.status && (
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(session.status)}`}>
              {STATUS_LABEL[session.status]}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-surface pt-3">
          <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div>
              <dt className="text-muted">Tipo</dt>
              <dd>{kindLabel(kind)}</dd>
            </div>
            <div>
              <dt className="text-muted">Zona</dt>
              <dd>{zone}</dd>
            </div>
            <div>
              <dt className="text-muted">Potencia</dt>
              <dd>{session.target_power != null ? `${session.target_power} W` : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Pulso</dt>
              <dd>{session.target_hr != null ? `${session.target_hr} ppm` : '—'}</dd>
            </div>
          </dl>

          {purpose && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Objetivo</h3>
              <p className="mt-0.5 text-xs text-foreground">{purpose}</p>
            </section>
          )}

          {bikeBlocks.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Diseño / series</h3>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-surface text-muted">
                      <th className="py-1 pr-2 font-medium">Bloque</th>
                      <th className="py-1 pr-2 font-medium">Tiempo</th>
                      <th className="py-1 font-medium">Intensidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bikeBlocks.map((b, i) => (
                      <tr key={`${b.label}-${i}`} className="border-b border-surface/60">
                        <td className="py-1 pr-2">{b.label}</td>
                        <td className="py-1 pr-2 tabular-nums">
                          {b.repeats != null && b.minutes != null
                            ? `${b.repeats} × ${b.minutes} min`
                            : b.minutes != null
                              ? `${b.minutes} min`
                              : '—'}
                        </td>
                        <td className="py-1">{b.intensity ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {strengthRows.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Ejercicios</h3>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-surface text-muted">
                      <th className="py-1 pr-2 font-medium">Ejercicio</th>
                      <th className="py-1 pr-2 font-medium">Series</th>
                      <th className="py-1 pr-2 font-medium">Reps</th>
                      <th className="py-1 font-medium">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strengthRows.map((row) => (
                      <tr key={row.exercise} className="border-b border-surface/60">
                        <td className="py-1 pr-2">{row.exercise}</td>
                        <td className="py-1 pr-2 tabular-nums">{row.sets}</td>
                        <td className="py-1 pr-2 tabular-nums">{row.reps}</td>
                        <td className="py-1 text-muted">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {description && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Prescripción</h3>
              <p className="mt-0.5 text-xs text-muted whitespace-pre-wrap">{description}</p>
            </section>
          )}

          {(tip || session.rationale) && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">A tener en cuenta</h3>
              {tip && <p className="mt-0.5 text-xs text-foreground">{tip}</p>}
              {session.rationale && <p className="mt-1 text-xs text-muted">{session.rationale}</p>}
            </section>
          )}

          {actions && <div className="flex justify-end gap-2 pt-1">{actions}</div>}
        </div>
      )}
    </div>
  )
}
