'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, X } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutStatus } from '@/lib/types/database'
import { looksCombined, looksStrength, splitCombinedSession } from '@/lib/training/split-sessions'

export type ScheduledWorkout = {
  id: string
  scheduled_date: string
  workout_type: string | null
  title: string | null
  description: string | null
  duration_minutes: number | null
  target_zone: string | null
  target_power: number | null
  target_hr: number | null
  purpose: string | null
  rationale: string | null
  status: WorkoutStatus
}

type DraftWorkout = {
  scheduled_date: string
  workout_type: string
  title: string
  description: string
  duration_minutes: number
  target_zone: string
  target_power: number | null
  target_hr: number | null
  purpose: string
  estimated_load: number
}

type Draft = {
  startDate: string
  endDate: string
  emphasis: 'recovery' | 'maintenance' | 'build'
  blockPosition: number
  weeklyTargetLoad: number
  plannedLoad: number
  workouts: DraftWorkout[]
  notes: string[]
}

type Proposal = { draft: Draft; rationale: string | null; replacesExisting: number }

const EMPHASIS_LABEL: Record<Draft['emphasis'], string> = {
  recovery: 'Descarga',
  maintenance: 'Mantenimiento',
  build: 'Carga',
}

const STATUS_LABEL: Record<WorkoutStatus, string> = {
  scheduled: 'Programado',
  completed: 'Hecho',
  skipped: 'Saltado',
  moved: 'Movido',
}

function weekday(date: string): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00Z`)
  )
}

function isStrengthSession(w: { title?: string | null; workout_type?: string | null }): boolean {
  return looksStrength(w.title, w.workout_type)
}

function groupByDate<T extends { scheduled_date: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(item.scheduled_date) ?? []
    list.push(item)
    map.set(item.scheduled_date, list)
  }
  return Array.from(map.entries())
}

function statusClass(status: WorkoutStatus): string {
  if (status === 'completed') return 'bg-green-100 text-green-800'
  if (status === 'skipped') return 'bg-slate-100 text-slate-500'
  return 'bg-blue-100 text-blue-800'
}

export function PlanBoard({ workouts }: { workouts: ScheduledWorkout[] }) {
  const router = useRouter()
  const supabase = createClient()

  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState<'propose' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const splitting = useRef(false)

  useEffect(() => {
    if (splitting.current) return
    const combined = workouts.filter((w) => looksCombined(w.title))
    if (!combined.length) return

    splitting.current = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      for (const w of combined) {
        const alreadySplit = workouts.some(
          (other) => other.id !== w.id && other.scheduled_date === w.scheduled_date && isStrengthSession(other)
        )
        if (alreadySplit) continue

        const parts = splitCombinedSession(w.title ?? '', w.duration_minutes)
        if (!parts || parts.length < 2) continue

        const bike = parts.find((p) => p.kind === 'bike') ?? parts[0]
        const strength = parts.find((p) => p.kind === 'strength') ?? parts[1]

        await supabase
          .from('workouts')
          .update({
            title: bike.title,
            duration_minutes: bike.duration_minutes,
            description: w.description,
          })
          .eq('id', w.id)

        await supabase.from('workouts').insert({
          user_id: user.id,
          scheduled_date: w.scheduled_date,
          workout_type: 'strength',
          title: strength.title,
          description: 'Sesión de fuerza, independiente de la bici.',
          duration_minutes: strength.duration_minutes,
          target_zone: 'Fuerza',
          purpose: 'Mantener fuerza y estabilidad sin meter fatiga de ciclismo.',
          status: w.status === 'completed' ? 'scheduled' : w.status,
        })
      }
      router.refresh()
    })().finally(() => {
      splitting.current = false
    })
  }, [workouts, router, supabase])

  const propose = async () => {
    setBusy('propose')
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'propose' }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'No se pudo generar la propuesta.')
      setProposal(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setBusy(null)
    }
  }

  const commit = async () => {
    if (!proposal) return
    setBusy('commit')
    setError(null)
    try {
      const response = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          draft: proposal.draft,
          rationale: proposal.rationale,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'No se pudo guardar el plan.')

      setProposal(null)
      setSuccess(`Plan guardado: ${body.created} sesiones.`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (id: string, status: WorkoutStatus) => {
    setError(null)
    const { error: updateError } = await supabase.from('workouts').update({ status }).eq('id', id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    router.refresh()

    const row = workouts.find((w) => w.id === id)
    if (status === 'completed' && row && !isStrengthSession(row)) {
      fetch('/api/garmin/sync', { method: 'POST' })
        .then(() => router.refresh())
        .catch(() => {})
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={propose} loading={busy === 'propose'} disabled={busy !== null}>
          <CalendarPlus aria-hidden className="h-4 w-4" />
          Proponer semana
        </Button>
        <span className="text-xs text-slate-500">Nada se guarda hasta que aprobés la propuesta.</span>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {proposal && (
        <Card className="space-y-4 border-slate-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">
              Propuesta · {proposal.draft.startDate} a {proposal.draft.endDate}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {EMPHASIS_LABEL[proposal.draft.emphasis]}
            </span>
          </div>

          <p className="text-sm text-slate-600">
            Semana {proposal.draft.blockPosition} de 4 del bloque · carga objetivo {proposal.draft.weeklyTargetLoad} ·
            planificada {proposal.draft.plannedLoad}
          </p>

          {proposal.rationale && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{proposal.rationale}</p>
          )}

          {proposal.draft.notes.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-700">
              {proposal.draft.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}

          {proposal.draft.workouts.length === 0 ? (
            <Alert variant="info">No se pudo armar la semana. Revisá tu disponibilidad.</Alert>
          ) : (
            <div className="space-y-4">
              {groupByDate(proposal.draft.workouts).map(([date, sessions]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{weekday(date)}</p>
                  {sessions.map((w, i) => (
                    <SessionCard
                      key={`${w.scheduled_date}-${w.workout_type}-${i}`}
                      title={w.title}
                      zone={w.target_zone}
                      minutes={w.duration_minutes}
                      description={w.description}
                      purpose={w.purpose}
                      strength={isStrengthSession(w)}
                      extra={
                        w.estimated_load
                          ? `carga ${w.estimated_load}`
                          : w.target_power || w.target_hr
                            ? [w.target_power ? `${w.target_power} W` : null, w.target_hr ? `${w.target_hr} ppm` : null]
                                .filter(Boolean)
                                .join(' · ')
                            : null
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {proposal.replacesExisting > 0 && (
            <Alert variant="info">
              Aprobar reemplaza {proposal.replacesExisting} sesión(es) ya programada(s) en esas fechas. Las que
              marcaste como hechas no se tocan.
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={commit}
              loading={busy === 'commit'}
              disabled={busy !== null || proposal.draft.workouts.length === 0}
            >
              <Check aria-hidden className="h-4 w-4" />
              Aprobar y guardar
            </Button>
            <Button variant="secondary" onClick={() => setProposal(null)} disabled={busy !== null}>
              <X aria-hidden className="h-4 w-4" />
              Descartar
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Agenda</h2>
        {workouts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Todavía no hay sesiones programadas. Generá una propuesta para arrancar.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {groupByDate(workouts).map(([date, sessions]) => (
              <div key={date} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{weekday(date)}</p>
                {sessions.map((w) => (
                  <SessionCard
                    key={w.id}
                    title={w.title ?? 'Sesión'}
                    zone={w.target_zone}
                    minutes={w.duration_minutes}
                    description={w.description}
                    purpose={w.purpose}
                    strength={isStrengthSession(w)}
                    status={w.status}
                    extra={
                      w.target_power || w.target_hr
                        ? [w.target_power ? `${w.target_power} W` : null, w.target_hr ? `${w.target_hr} ppm` : null]
                            .filter(Boolean)
                            .join(' · ')
                        : null
                    }
                    actions={
                      w.status === 'scheduled' ? (
                        <>
                          <Button variant="secondary" onClick={() => setStatus(w.id, 'completed')}>
                            Hecho
                          </Button>
                          <Button variant="secondary" onClick={() => setStatus(w.id, 'skipped')}>
                            Saltar
                          </Button>
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function SessionCard({
  title,
  zone,
  minutes,
  description,
  purpose,
  extra,
  strength,
  status,
  actions,
}: {
  title: string
  zone: string | null
  minutes: number | null
  description: string | null
  purpose: string | null
  extra?: string | null
  strength: boolean
  status?: WorkoutStatus
  actions?: React.ReactNode
}) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        strength ? 'border-amber-400/40 bg-amber-50/5' : 'border-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                strength ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'
              }`}
            >
              {strength ? 'Fuerza' : 'Bici'}
            </span>
            <p className="text-sm font-medium text-foreground">{title}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[zone, minutes != null ? `${minutes} min` : null, extra].filter(Boolean).join(' · ')}
          </p>
        </div>
        {status && (
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClass(status)}`}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {purpose && <p className="text-xs italic text-slate-400">{purpose}</p>}
      {actions && <div className="flex justify-end gap-2 pt-1">{actions}</div>}
    </div>
  )
}
