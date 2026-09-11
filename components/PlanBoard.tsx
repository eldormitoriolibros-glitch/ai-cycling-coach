'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Layers, X } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutStatus } from '@/lib/types/database'
import { looksCombined, looksStrength, splitCombinedSession } from '@/lib/training/split-sessions'
import { addDays, eachDay, endOfWeek, formatWeekRange, startOfWeek } from '@/lib/training/dates'
import { SessionCard } from '@/components/plan/SessionCard'
import { requestSessionReview, updateWorkoutStatus } from '@/components/plan/mark-workout'
import { WorkoutStatusActions } from '@/components/plan/WorkoutStatusActions'

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
  completed_activity_id?: string | null
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

function weekStats(sessions: ScheduledWorkout[]) {
  const minutes = sessions.reduce((s, w) => s + (w.duration_minutes ?? 0), 0)
  const bike = sessions.filter((w) => !isStrengthSession(w)).length
  const strength = sessions.filter((w) => isStrengthSession(w)).length
  return { minutes, bike, strength }
}

export function PlanBoard({
  workouts,
  today,
  focusDate,
  focusSessionId,
}: {
  workouts: ScheduledWorkout[]
  today: string
  focusDate?: string
  focusSessionId?: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState<'propose' | 'cycle' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [view, setView] = useState<'week' | 'cycle'>('week')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(focusDate ?? today))
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const splitting = useRef(false)

  useEffect(() => {
    if (!focusDate) return
    setView('week')
    setWeekStart(startOfWeek(focusDate))
  }, [focusDate, focusSessionId])

  function goToday() {
    setView('week')
    setWeekStart(startOfWeek(today))
    setFocusDay(today)
    setFocusTick((n) => n + 1)
  }

  useEffect(() => {
    const target = focusDay
      ? `plan-day-${focusDay}`
      : focusSessionId
        ? `plan-session-${focusSessionId}`
        : null
    if (!target) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusDay, focusTick, focusSessionId, weekStart])

  const weekEnd = endOfWeek(weekStart)
  const cycleStart = weekStart
  const cycleEnd = addDays(weekStart, 27)

  const weekSessions = useMemo(
    () => workouts.filter((w) => w.scheduled_date >= weekStart && w.scheduled_date <= weekEnd),
    [workouts, weekStart, weekEnd]
  )
  const cycleSessions = useMemo(
    () => workouts.filter((w) => w.scheduled_date >= cycleStart && w.scheduled_date <= cycleEnd),
    [workouts, cycleStart, cycleEnd]
  )

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

  const propose = async (action: 'propose' | 'propose_cycle') => {
    setBusy(action === 'propose_cycle' ? 'cycle' : 'propose')
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, startDate: weekStart }),
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
    try {
      await updateWorkoutStatus(id, status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la sesión.')
      return
    }
    router.refresh()

    if (status !== 'completed') return

    // The review needs the ride, so the route syncs Garmin before analysing.
    setReviewing(id)
    setSuccess('Sesión marcada. El entrenador está analizándola…')
    try {
      const result = await requestSessionReview(id)
      setSuccess(
        result.sent
          ? 'Listo: el entrenador te mandó la devolución de la sesión.'
          : 'Sesión marcada como hecha.'
      )
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'No se pudo generar la devolución.')
    } finally {
      setReviewing(null)
      router.refresh()
    }
  }

  const stats = weekStats(view === 'week' ? weekSessions : cycleSessions)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => propose('propose')} loading={busy === 'propose'} disabled={busy !== null}>
          <CalendarPlus aria-hidden className="h-4 w-4" />
          Proponer semana
        </Button>
        <Button variant="secondary" onClick={() => propose('propose_cycle')} loading={busy === 'cycle'} disabled={busy !== null}>
          <Layers aria-hidden className="h-4 w-4" />
          Proponer ciclo
        </Button>
        <span className="text-xs text-slate-500">Nada se guarda hasta que aprobés. Los cambios del plan se piden al entrenador y se confirman.</span>
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
            <Alert variant="info">No se pudo armar la propuesta. Revisá tu disponibilidad.</Alert>
          ) : (
            <div className="space-y-4">
              {groupByDate(proposal.draft.workouts).map(([date, sessions]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{weekday(date)}</p>
                  {sessions.map((w, i) => (
                    <SessionCard
                      key={`${w.scheduled_date}-${w.workout_type}-${i}`}
                      session={w}
                      extra={w.estimated_load ? String(w.estimated_load) : null}
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

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-surface p-1">
            <button
              type="button"
              onClick={() => setView('week')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                view === 'week' ? 'bg-accent-500 text-white' : 'text-muted'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setView('cycle')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                view === 'cycle' ? 'bg-accent-500 text-white' : 'text-muted'
              }`}
            >
              Ciclo (4 sem)
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded p-1 hover:bg-background"
              aria-label="Anterior"
              onClick={() => setWeekStart((d) => addDays(d, view === 'cycle' ? -28 : -7))}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="min-w-[9rem] text-center text-sm font-medium capitalize">
              {view === 'week' ? formatWeekRange(weekStart, weekEnd) : formatWeekRange(cycleStart, cycleEnd)}
            </p>
            <button
              type="button"
              className="rounded p-1 hover:bg-background"
              aria-label="Siguiente"
              onClick={() => setWeekStart((d) => addDays(d, view === 'cycle' ? 28 : 7))}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <Button variant="secondary" onClick={goToday}>
              Hoy
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted">
          {stats.bike} bici · {stats.strength} fuerza ·{' '}
          <span className="font-semibold tabular-nums text-foreground">{stats.minutes || 0} min</span>
        </p>

        {view === 'week' ? (
          <WeekAgenda
            start={weekStart}
            today={today}
            sessions={weekSessions}
            onStatus={setStatus}
            reviewing={reviewing}
            focusSessionId={focusDay ? undefined : focusSessionId}
            focusDay={focusDay}
          />
        ) : (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => {
              const start = addDays(cycleStart, i * 7)
              const end = addDays(start, 6)
              const sessions = cycleSessions.filter((w) => w.scheduled_date >= start && w.scheduled_date <= end)
              const s = weekStats(sessions)
              return (
                <div key={start} className="rounded-lg border border-surface p-3 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold capitalize">
                      Semana {i + 1} · {formatWeekRange(start, end)}
                    </h3>
                    <p className="text-xs text-muted">
                      {s.bike + s.strength} sesiones ·{' '}
                      <span className="font-semibold tabular-nums text-foreground">{s.minutes} min</span>
                    </p>
                  </div>
                  <WeekAgenda
                    start={start}
                    today={today}
                    sessions={sessions}
                    compact
                    onStatus={setStatus}
                    reviewing={reviewing}
                    focusSessionId={focusDay ? undefined : focusSessionId}
                    focusDay={focusDay}
                  />
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function WeekAgenda({
  start,
  today,
  sessions,
  compact,
  onStatus,
  reviewing,
  focusSessionId,
  focusDay,
}: {
  start: string
  today: string
  sessions: ScheduledWorkout[]
  compact?: boolean
  onStatus: (id: string, status: WorkoutStatus) => void
  reviewing: string | null
  focusSessionId?: string
  focusDay?: string | null
}) {
  const days = eachDay(start, addDays(start, 6))
  const byDate = new Map<string, ScheduledWorkout[]>()
  for (const w of sessions) {
    const list = byDate.get(w.scheduled_date) ?? []
    list.push(w)
    byDate.set(w.scheduled_date, list)
  }

  return (
    <div className="space-y-4">
      {days.map((date) => {
        const daySessions = byDate.get(date) ?? []
        return (
          <div id={`plan-day-${date}`} key={date} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {weekday(date)}
                {date === today ? ' · Hoy' : date < today ? ' · Pasado' : ''}
              </p>
              {daySessions.length > 0 && (
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {daySessions.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0)} min
                </p>
              )}
            </div>
            {daySessions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-surface px-3 py-2 text-xs text-muted">
                Libre / descanso
              </p>
            ) : (
              daySessions.map((w) => (
                <SessionCard
                  key={w.id}
                  session={w}
                  past={date < today}
                  defaultOpen={w.id === focusSessionId || date === focusDay || (!compact && date === today)}
                  highlighted={w.id === focusSessionId || date === focusDay}
                  actions={
                    w.status === 'scheduled' && date >= today ? (
                      <WorkoutStatusActions workoutId={w.id} busyId={reviewing} onStatus={onStatus} />
                    ) : undefined
                  }
                />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
