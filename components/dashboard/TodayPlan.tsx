'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Alert } from '@/components/ui'
import { SessionCard, type PlanSession } from '@/components/plan/SessionCard'
import { WorkoutStatusActions } from '@/components/plan/WorkoutStatusActions'
import { useWorkoutStatus } from '@/components/plan/useWorkoutStatus'
import { looksStrength } from '@/lib/training/split-sessions'

function sessionDone(session: PlanSession): boolean {
  return session.status === 'completed' || session.status === 'skipped'
}

function sortTodaySessions(sessions: PlanSession[]): PlanSession[] {
  return [...sessions].sort((a, b) => {
    const aDone = sessionDone(a) ? 1 : 0
    const bDone = sessionDone(b) ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    const aStrength = looksStrength(a.title, a.workout_type) ? 1 : 0
    const bStrength = looksStrength(b.title, b.workout_type) ? 1 : 0
    return aStrength - bStrength
  })
}

export function TodayPlan({
  sessions,
  today,
}: {
  sessions: PlanSession[]
  today: string
}) {
  const { setStatus, busyId, error, success } = useWorkoutStatus()

  const ordered = sortTodaySessions(sessions)

  if (sessions.length === 0) {
    return (
      <section className="rounded-xl border border-surface bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-accent-400 to-accent-600" />
            Plan de hoy
          </h2>
          <Link
            href={`/plan?date=${today}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400"
          >
            Ver semana
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="text-sm text-muted">Hoy no hay nada en el plan.</p>
        <Link
          href="/coach"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-600 dark:text-accent-400"
        >
          Pedile una sesión al entrenador
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-surface bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-accent-400 to-accent-600" />
          Plan de hoy
        </h2>
        <Link
          href={`/plan?date=${today}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400"
        >
          Ver semana
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {(error || success) && (
        <div className="mb-3">
          {error && <Alert variant="error">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}
        </div>
      )}
      <div className="space-y-2">
        {ordered.map((session) => (
          <SessionCard
            key={session.id ?? `${session.workout_type}-${session.title}`}
            session={session}
            defaultOpen={!sessionDone(session)}
            actions={
              session.id && session.status === 'scheduled' ? (
                <WorkoutStatusActions workoutId={session.id} busyId={busyId} onStatus={setStatus} />
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}
