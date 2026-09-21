import { createClient } from '@/lib/supabase/server'
import { WeeklyCalendarStrip } from '@/components/calendar/WeeklyCalendarStrip'
import { HowAmILine, HowAmISection } from '@/components/dashboard/HowAmISection'
import { RecoverySection } from '@/components/dashboard/RecoverySection'
import { TodayPlan } from '@/components/dashboard/TodayPlan'
import { TrainingLoadDashboard } from '@/components/TrainingLoadDashboard'
import { assessFormStatus } from '@/lib/training/form-status'
import { readinessFrom } from '@/lib/training/readiness-input'
import { buildAbsorption } from '@/lib/training/absorption'
import { buildRecoverySeries } from '@/lib/training/recovery-series'
import { todayPlanState } from '@/lib/training/how-am-i'
import { localDateKey } from '@/lib/training/dates'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const historyFrom = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)

  const { data: profile } = await supabase
    .from('users')
    .select('name, timezone')
    .eq('id', user!.id)
    .maybeSingle()

  const today = localDateKey(new Date(), profile?.timezone || 'UTC')

  const [{ data: loadHistory }, { data: recovery }, { data: sleep }, { data: todayWorkouts }, { data: metrics }] =
    await Promise.all([
    supabase
      .from('training_load')
      .select('date, daily_load, chronic_load, acute_load, form, ramp_rate')
      .eq('user_id', user!.id)
      .gte('date', historyFrom)
      .order('date', { ascending: true }),
    supabase
      .from('recovery_metrics')
      .select('date, source, resting_hr, hrv, stress, soreness, motivation, body_battery_high, spo2_avg')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(28),
    supabase
      .from('sleep')
      .select('date, source, duration_minutes, sleep_score')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(28),
    supabase
      .from('workouts')
      .select(
        'id, scheduled_date, workout_type, title, description, duration_minutes, target_zone, target_power, target_hr, purpose, rationale, status, completed_activity_id'
      )
      .eq('user_id', user!.id)
      .eq('scheduled_date', today)
      .order('workout_type', { ascending: true }),
    supabase.from('athlete_metrics').select('ftp').eq('user_id', user!.id).maybeSingle(),
  ])

  const load = loadHistory?.length ? loadHistory[loadHistory.length - 1] : null
  const ctlHistory = (loadHistory ?? [])
    .map((row) => row.chronic_load)
    .filter((v): v is number => v != null)

  const status = load
    ? assessFormStatus({
        form: load.form,
        chronicLoad: load.chronic_load,
        acuteLoad: load.acute_load,
        rampRate: load.ramp_rate,
        ctlHistory,
      })
    : null

  const readiness = readinessFrom({
    form: load?.form ?? null,
    recovery: recovery ?? [],
    sleep: sleep ?? [],
  })
  const recoveryTrend = buildRecoverySeries({
    today,
    days: 14,
    sleep: sleep ?? [],
    recovery: recovery ?? [],
  })
  const absorption = buildAbsorption({
    series: recoveryTrend.series,
    loads: loadHistory ?? [],
    ftp: metrics?.ftp ?? null,
  })

  const firstName = (profile?.name || user?.email?.split('@')[0] || 'ciclista').split(' ')[0]

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-surface bg-surface p-5 shadow-sm sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent-500/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600 dark:text-accent-400">
              {formatToday(profile?.timezone)}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">Hola, {firstName}.</h1>
            <div className="mt-2">
              <HowAmILine
                readiness={readiness}
                status={status}
                todayPlan={todayPlanState(todayWorkouts ?? [])}
              />
            </div>
          </div>
          <dl className="flex shrink-0 gap-4 sm:gap-6">
            <HeroStat label="Readiness" value={readiness.score} hint={readiness.label} />
            {status?.form.value != null ? (
              <HeroStat
                label="Forma"
                value={Math.round(status.form.value)}
                hint={status.form.bandLabel}
                signed
              />
            ) : null}
          </dl>
        </div>
      </section>

      <TodayPlan sessions={todayWorkouts ?? []} today={today} />

      <RecoverySection
        today={today}
        series={recoveryTrend.series}
        todayPoint={recoveryTrend.todayPoint}
        loggedToday={recoveryTrend.loggedToday}
        absorption={absorption}
      />

      <HowAmISection readiness={readiness} status={status} />

      <WeeklyCalendarStrip />

      <TrainingLoadDashboard days={28} compact showStats={false} collapsible featured="daily" />
    </div>
  )
}

function formatToday(timezone?: string | null): string {
  const label = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone || 'America/Argentina/Buenos_Aires',
  }).format(new Date())
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function HeroStat({
  label,
  value,
  hint,
  signed = false,
}: {
  label: string
  value: number
  hint?: string
  signed?: boolean
}) {
  const shown = signed && value > 0 ? `+${value}` : String(value)
  return (
    <div className="min-w-[4.5rem]">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums tracking-tight">{shown}</dd>
      {hint ? <dd className="text-[11px] text-muted">{hint}</dd> : null}
    </div>
  )
}
