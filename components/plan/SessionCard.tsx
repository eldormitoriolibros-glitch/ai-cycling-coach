'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import type { WorkoutStatus } from '@/lib/types/database'
import { looksStrength } from '@/lib/training/split-sessions'
import {
  blocksForBikeSession,
  dedupeWarmupCooldownProse,
  formatBikeDescription,
  strengthExercises,
} from '@/lib/training/workout-blocks'
import { considerationsFor, hasIntervalSeries, SESSION_KIND_OPTIONS } from '@/lib/training/session-notes'
import {
  expandIntervalShorthand,
  looksGenericEnduranceText,
  looksGroupRide,
  resolveSessionKind,
  resolveSessionZone,
} from '@/lib/training/session-prescription'

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
  completed_activity_id?: string | null
}

const STATUS_LABEL: Record<WorkoutStatus, string> = {
  scheduled: 'Pendiente',
  completed: 'Hecho',
  skipped: 'Saltado',
  moved: 'Movido',
}

function statusClass(status: WorkoutStatus): string {
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
  if (status === 'skipped') return 'bg-slate-500/15 text-muted'
  return 'bg-sky-500/15 text-sky-800 dark:text-sky-300'
}

function kindLabel(kind: string | null | undefined, groupRide = false): string {
  if (groupRide) return 'Grupeta'
  return SESSION_KIND_OPTIONS.find((k) => k.id === kind)?.label ?? (kind === 'strength' ? 'Fuerza' : 'Bici')
}

export function SessionCard({
  session,
  past,
  defaultOpen = false,
  highlighted = false,
  extra,
  actions,
}: {
  session: PlanSession
  past?: boolean
  defaultOpen?: boolean
  highlighted?: boolean
  extra?: string | null
  actions?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const statusRef = useRef(session.status)

  useEffect(() => {
    if (highlighted) setOpen(true)
  }, [highlighted])

  useEffect(() => {
    if (
      statusRef.current !== session.status &&
      (session.status === 'completed' || session.status === 'skipped')
    ) {
      setOpen(false)
    }
    statusRef.current = session.status
  }, [session.status])
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
  const groupRide = looksGroupRide(session.title, session.description)
  const groupWork = groupRide && hasIntervalSeries(session.title, session.description)
  const strengthRows = strength ? strengthExercises(session.description, session.title) : []
  const tip = groupRide
    ? null
    : considerationsFor({
        kind,
        title: session.title,
        description: session.description,
      })
  const fromTitle = expandIntervalShorthand(session.title, session.description)
  const description = groupRide && !groupWork
    ? null
    : fromTitle && looksGenericEnduranceText(session.description)
      ? formatBikeDescription({
          kind,
          totalMinutes: session.duration_minutes ?? 60,
          zone,
          mainWork: fromTitle,
        })
      : dedupeWarmupCooldownProse(session.description)
  // Blocks read the same text the athlete sees, so table and prose can't disagree.
  const bikeBlocks = strength
    ? []
    : blocksForBikeSession({
        description: groupRide ? session.description : description,
        minutes: session.duration_minutes,
        zone,
        kind,
        title: session.title,
      })
  const purpose = groupRide
    ? session.purpose
    : kind === 'threshold' && /base aer/i.test(session.purpose ?? '')
      ? 'Empujar el FTP: bloques de calidad en Z4 / Sweet Spot, no un rodaje de conversación.'
      : session.purpose

  return (
    <div
      id={session.id ? `plan-session-${session.id}` : undefined}
      className={`rounded-lg border p-3 space-y-2 ${past && !highlighted ? 'opacity-70' : ''} ${
        highlighted
          ? 'border-accent-500 bg-accent-500/10 ring-2 ring-accent-500/40'
          : strength
            ? 'border-amber-400/40 bg-amber-50/5'
            : 'border-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                strength
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  : 'bg-accent-500/15 text-accent-700 dark:text-accent-300'
              }`}
            >
              {strength ? 'Fuerza' : 'Bici'}
            </span>
            <p className="text-sm font-medium text-foreground">{session.title ?? 'Sesión'}</p>
          </div>
          <p className="mt-1 text-xs text-muted">
            {groupRide ? (groupWork && zone ? `Grupeta · ${zone}` : 'Grupeta') : zone ? zone : null}
            {!groupRide && zone && session.target_power != null ? ' · ' : null}
            {!groupRide && session.target_power != null ? `${session.target_power} W` : null}
            {(groupRide || zone || session.target_power != null) && extra ? ' · ' : null}
            {extra ? `carga ${extra.replace(/^carga\s+/i, '')}` : null}
            {!groupRide && !zone && session.target_power == null && !extra ? kindLabel(kind) : null}
            <span className="ml-2 text-accent-600 dark:text-accent-400">
              {open ? 'Ocultar detalle' : 'Ver diseño'}
            </span>
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="min-w-[3.25rem] rounded-lg bg-accent-500/10 px-2.5 py-1.5 text-center ring-1 ring-inset ring-accent-500/20"
            title="Duración total"
          >
            <p className="text-lg font-bold leading-none tabular-nums text-foreground">
              {session.duration_minutes != null ? session.duration_minutes : '—'}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-400">
              min
            </p>
          </div>
          {session.status && (
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(session.status)}`}>
              {STATUS_LABEL[session.status]}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-surface pt-3">
          <dl className={`grid grid-cols-2 gap-2 text-[11px] ${groupRide ? 'sm:grid-cols-2' : 'sm:grid-cols-5'}`}>
            <div>
              <dt className="text-muted">Duración</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {session.duration_minutes != null ? `${session.duration_minutes} min` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Tipo</dt>
              <dd>{kindLabel(kind, groupRide)}</dd>
            </div>
            {!groupRide && (
              <>
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
              </>
            )}
          </dl>

          {purpose && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Objetivo</h3>
              <p className="mt-0.5 text-xs text-foreground">{purpose}</p>
            </section>
          )}

          {bikeBlocks.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {groupRide && !groupWork ? 'Bloques' : 'Diseño / series'}
              </h3>
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
                        <td className="py-1 pr-2 font-semibold tabular-nums text-foreground">
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

          {session.completed_activity_id && (
            <Link
              href={`/activities/${session.completed_activity_id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:underline dark:text-accent-400"
            >
              <Activity aria-hidden className="h-3.5 w-3.5" />
              Ver la actividad
            </Link>
          )}

          {!groupRide && (tip || session.rationale) && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">A tener en cuenta</h3>
              {tip && <p className="mt-0.5 text-xs text-foreground">{tip}</p>}
              {session.rationale && <p className="mt-1 text-xs text-muted">{session.rationale}</p>}
            </section>
          )}

        </div>
      )}

      {actions && <div className="flex justify-end gap-2 pt-2">{actions}</div>}
    </div>
  )
}
