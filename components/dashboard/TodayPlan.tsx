import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SessionCard, type PlanSession } from '@/components/plan/SessionCard'

export function TodayPlan({
  sessions,
  today,
}: {
  sessions: PlanSession[]
  today: string
}) {
  if (sessions.length === 0) return null

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
      <div className="space-y-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id ?? `${session.workout_type}-${session.title}`}
            session={session}
            defaultOpen={sessions.length === 1}
          />
        ))}
      </div>
    </section>
  )
}
