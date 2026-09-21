import { notFound } from 'next/navigation'
import { CalendarCheck, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { ActivityCharts } from '@/components/ActivityCharts'
import { ActivityLaps } from '@/components/activity/ActivityLaps'
import { PedalViz } from '@/components/activity/PedalViz'
import { Card } from '@/components/ui'
import { loadActivityLaps } from '@/lib/activities/laps'
import { loadActivitySamples } from '@/lib/activities/samples'
import { createClient } from '@/lib/supabase/server'
import { localDateKey } from '@/lib/training/dates'
import { formatDistance, formatDuration } from '@/lib/utils'
import type { PedalMetrics } from '@/lib/garmin/pedal-metrics'

export const dynamic = 'force-dynamic'

export default async function ActivityDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return notFound()
  }

  const [{ data: activity }, { data: metrics }, samples, laps, { data: linked }] = await Promise.all([
    supabase.from('activities').select('*').eq('id', params.id).eq('user_id', user.id).maybeSingle(),
    supabase.from('athlete_metrics').select('ftp, max_hr').eq('user_id', user.id).maybeSingle(),
    loadActivitySamples(supabase, params.id).catch(() => []),
    loadActivityLaps(supabase, params.id).catch(() => []),
    supabase
      .from('workouts')
      .select(
        'id, scheduled_date, workout_type, title, description, duration_minutes, target_zone, target_power'
      )
      .eq('user_id', user.id)
      .eq('completed_activity_id', params.id)
      .maybeSingle(),
  ])

  if (!activity) {
    return notFound()
  }

  // Sessions marked done by hand may not carry the activity id yet, so fall
  // back to the session scheduled for the same day.
  const { data: profile } = linked
    ? { data: null }
    : await supabase.from('users').select('timezone').eq('id', user.id).maybeSingle()

  const sameDay = linked
    ? null
    : (
        await supabase
          .from('workouts')
          .select(
            'id, scheduled_date, workout_type, title, description, duration_minutes, target_zone, target_power'
          )
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .eq('scheduled_date', localDateKey(activity.start_time, profile?.timezone || 'UTC'))
          .neq('workout_type', 'strength')
          .maybeSingle()
      ).data

  const workout = linked ?? sameDay

  const activityWithMetrics = {
    ...activity,
    ftp: metrics?.ftp ?? undefined,
    maxHr: metrics?.max_hr ?? undefined,
  }

  const duration = activity.moving_seconds ?? activity.duration_seconds
  const coachDetails = [
    activity.distance_meters ? { label: 'Distancia', value: formatDistance(activity.distance_meters) } : null,
    duration ? { label: 'Duración', value: formatDuration(duration) } : null,
    activity.elevation_gain_meters
      ? { label: 'Desnivel', value: `+${Math.round(activity.elevation_gain_meters)} m` }
      : null,
    activity.avg_hr ? { label: 'Pulso medio', value: `${activity.avg_hr} ppm` } : null,
    activity.max_hr ? { label: 'Pulso máximo', value: `${activity.max_hr} ppm` } : null,
    activity.avg_power ? { label: 'Potencia media', value: `${Math.round(activity.avg_power)} W` } : null,
    activity.normalized_power ? { label: 'NP', value: `${Math.round(activity.normalized_power)} W` } : null,
    activity.max_power ? { label: 'Potencia máxima', value: `${Math.round(activity.max_power)} W` } : null,
    activity.avg_cadence ? { label: 'Cadencia', value: `${Math.round(activity.avg_cadence)} rpm` } : null,
    activity.training_load ? { label: 'Carga', value: `${Math.round(activity.training_load)}` } : null,
    activity.intensity_factor ? { label: 'IF', value: activity.intensity_factor.toFixed(2) } : null,
    activity.avg_temperature != null
      ? { label: 'Temp. ambiente', value: `${activity.avg_temperature.toFixed(1)} °C` }
      : null,
  ].filter((item): item is { label: string; value: string } => item != null)

  const details = (
    <Card className="space-y-4">
      <h2 className="font-semibold">Resumen</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {coachDetails.map((item) => (
          <DetailItem key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Link
          href={`/calendar?date=${localDateKey(activity.start_time, activity.timezone || 'UTC')}`}
          aria-label="Volver al calendario"
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface bg-surface text-muted transition hover:border-accent-500/40 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{activity.title ?? 'Sin título'}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {new Date(activity.start_time).toLocaleString('es-AR')}
            {activity.source === 'manual' && (
              <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                Importado
              </span>
            )}
          </p>
        </div>
      </div>

      {workout && (
        <Link
          href={`/plan?date=${workout.scheduled_date}&session=${workout.id}`}
          className="flex items-center gap-2 rounded-xl border border-surface bg-surface px-4 py-3 text-sm transition hover:border-accent-500/40"
        >
          <CalendarCheck aria-hidden className="h-4 w-4 shrink-0 text-accent-500" />
          <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">
            Plan
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{workout.title ?? 'Sesión'}</span>
            {workout.duration_minutes ? (
              <span className="text-muted"> · {workout.duration_minutes} min</span>
            ) : null}
            {workout.target_zone ? <span className="text-muted"> · {workout.target_zone}</span> : null}
          </span>
          <span className="shrink-0 text-xs font-medium text-accent-600 dark:text-accent-400">Ver en el plan</span>
        </Link>
      )}

      {activity.description && (
        <Card>
          <p className="text-sm text-muted">{activity.description}</p>
        </Card>
      )}

      <ActivityCharts
        activity={activityWithMetrics}
        samples={samples}
        planned={workout}
        afterMap={
          <>
            {details}
            <ActivityLaps laps={laps} />
            <PedalViz metrics={activity.pedal_metrics as PedalMetrics | null} />
          </>
        }
      />
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  )
}
