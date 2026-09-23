'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus, ChevronLeft, ChevronRight, Moon } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutStatus } from '@/lib/types/database'
import { looksCombined, looksStrength, splitCombinedSession } from '@/lib/training/split-sessions'
import { addDays, eachDay, endOfWeek, formatWeekRange, startOfWeek } from '@/lib/training/dates'
import { SessionCard } from '@/components/plan/SessionCard'
import { WorkoutStatusActions } from '@/components/plan/WorkoutStatusActions'
import { useWorkoutStatus } from '@/components/plan/useWorkoutStatus'

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

function weekday(date: string): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00Z`)
  )
}

function RestDaySlot({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-teal-400/45 bg-teal-500/10 px-3 text-teal-900 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100 ${
        compact ? 'py-2' : 'py-2.5'
      }`}
    >
      <Moon aria-hidden className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-300" />
      <p className="text-sm font-medium">Descanso</p>
    </div>
  )
}

function isStrengthSession(w: { title?: string | null; workout_type?: string | null }): boolean {
  return looksStrength(w.title, w.workout_type)
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

  const { setStatus, busyId, error, success } = useWorkoutStatus()
  const [view, setView] = useState<'week' | 'cycle'>('week')
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

  const stats = weekStats(view === 'week' ? weekSessions : cycleSessions)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/coach?start=propose"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent-600/20 transition hover:bg-accent-500"
        >
          <CalendarPlus aria-hidden className="h-4 w-4" />
          Proponer entrenamiento
        </Link>
        <span className="text-xs text-slate-500">
          El entrenador pregunta objetivo, horizonte y tu semana típica. Nada se guarda hasta que confirmes el ciclo.
        </span>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

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
            busyId={busyId}
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
                    busyId={busyId}
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
  busyId,
  focusSessionId,
  focusDay,
}: {
  start: string
  today: string
  sessions: ScheduledWorkout[]
  compact?: boolean
  onStatus: (id: string, status: WorkoutStatus) => void
  busyId: string | null
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
              {daySessions.length > 0 ? (
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {daySessions.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0)} min
                </p>
              ) : (
                <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                  Descanso
                </span>
              )}
            </div>
            {daySessions.length === 0 ? (
              <RestDaySlot compact={compact} />
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
                      <WorkoutStatusActions workoutId={w.id} busyId={busyId} onStatus={onStatus} />
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
