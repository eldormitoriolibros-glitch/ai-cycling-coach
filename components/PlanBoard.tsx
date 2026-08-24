'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, X } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutStatus } from '@/lib/types/database'

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

export function PlanBoard({ workouts }: { workouts: ScheduledWorkout[] }) {
  const router = useRouter()
  const supabase = createClient()

  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState<'propose' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={propose} loading={busy === 'propose'} disabled={busy !== null}>
          <CalendarPlus aria-hidden className="h-4 w-4" />
          Proponer semana
        </Button>
        <span className="text-xs text-slate-500">
          Nada se guarda hasta que aprobés la propuesta.
        </span>
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
            Semana {proposal.draft.blockPosition} de 4 del bloque · carga objetivo{' '}
            {proposal.draft.weeklyTargetLoad} · planificada {proposal.draft.plannedLoad}
          </p>

          {proposal.rationale && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {proposal.rationale}
            </p>
          )}

          {proposal.draft.notes.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-700">
              {proposal.draft.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}

          {proposal.draft.workouts.length === 0 ? (
            <Alert variant="info">
              No se pudo armar la semana. Revisá tu disponibilidad.
            </Alert>
          ) : (
            <ul className="divide-y divide-slate-100">
              {proposal.draft.workouts.map((w) => (
                <li key={w.scheduled_date} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium capitalize">{weekday(w.scheduled_date)}</span>
                    <span className="text-sm text-slate-600">
                      {w.title} · {w.target_zone} · {w.duration_minutes} min · carga {w.estimated_load}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{w.description}</p>
                  {(w.target_power || w.target_hr) && (
                    <p className="mt-1 text-xs text-slate-500">
                      Objetivo: {w.target_power ? `${w.target_power} W` : ''}
                      {w.target_power && w.target_hr ? ' · ' : ''}
                      {w.target_hr ? `${w.target_hr} ppm` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {proposal.replacesExisting > 0 && (
            <Alert variant="info">
              Aprobar reemplaza {proposal.replacesExisting} sesión(es) ya programada(s) en esas fechas.
              Las que marcaste como hechas no se tocan.
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
          <ul className="mt-3 divide-y divide-slate-100">
            {workouts.map((w) => (
              <li key={w.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{weekday(w.scheduled_date)}</p>
                  <p className="text-sm text-slate-700">
                    {w.title} · {w.target_zone} · {w.duration_minutes} min
                  </p>
                  {w.description && <p className="mt-1 text-xs text-slate-500">{w.description}</p>}
                  {w.purpose && <p className="mt-1 text-xs italic text-slate-400">{w.purpose}</p>}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      w.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : w.status === 'skipped'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {STATUS_LABEL[w.status]}
                  </span>
                  {w.status === 'scheduled' && (
                    <>
                      <Button variant="secondary" onClick={() => setStatus(w.id, 'completed')}>
                        Hecho
                      </Button>
                      <Button variant="secondary" onClick={() => setStatus(w.id, 'skipped')}>
                        Saltar
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
