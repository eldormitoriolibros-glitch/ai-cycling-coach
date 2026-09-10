import { notFound } from 'next/navigation'
import { CalendarCheck, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { ActivityCharts } from '@/components/ActivityCharts'
import { ActivityLaps } from '@/components/activity/ActivityLaps'
import { Button, Card } from '@/components/ui'
import { loadActivityLaps } from '@/lib/activities/laps'
import { loadActivitySamples } from '@/lib/activities/samples'
import { createClient } from '@/lib/supabase/server'
import { localDateKey } from '@/lib/training/dates'
import { formatDistance, formatDuration } from '@/lib/utils'

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
      .select('id, scheduled_date, title, duration_minutes, target_zone')
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
          .select('id, scheduled_date, title, duration_minutes, target_zone')
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

  const details = (
    <Card className="space-y-4">
      <h2 className="font-semibold">Detalles de la actividad</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <DetailItem label="Tipo" value={activity.sport_type ?? activity.activity_type ?? '—'} />
        <DetailItem
          label="Distancia"
          value={activity.distance_meters ? formatDistance(activity.distance_meters) : '—'}
        />
        <DetailItem
          label="Duración total"
          value={activity.duration_seconds ? formatDuration(activity.duration_seconds) : '—'}
        />
        <DetailItem
          label="Tiempo en movimiento"
          value={activity.moving_seconds ? formatDuration(activity.moving_seconds) : '—'}
        />
        <DetailItem
          label="Elevación"
          value={activity.elevation_gain_meters ? `${Math.round(activity.elevation_gain_meters)} m` : '—'}
        />
        <DetailItem
          label="Velocidad media"
          value={activity.avg_speed ? `${(activity.avg_speed * 3.6).toFixed(1)} km/h` : '—'}
        />
        <DetailItem
          label="Velocidad máxima"
          value={activity.max_speed ? `${(activity.max_speed * 3.6).toFixed(1)} km/h` : '—'}
        />
        <DetailItem label="Pulso medio" value={activity.avg_hr ? `${activity.avg_hr} ppm` : '—'} />
        <DetailItem label="Pulso máximo" value={activity.max_hr ? `${activity.max_hr} ppm` : '—'} />
        <DetailItem
          label="Potencia media"
          value={activity.avg_power ? `${Math.round(activity.avg_power)} W` : '—'}
        />
        <DetailItem
          label="Potencia normalizada"
          value={activity.normalized_power ? `${Math.round(activity.normalized_power)} W` : '—'}
        />
        <DetailItem
          label="Potencia máxima"
          value={activity.max_power ? `${Math.round(activity.max_power)} W` : '—'}
        />
        <DetailItem
          label="Cadencia media"
          value={activity.avg_cadence ? `${Math.round(activity.avg_cadence)} rpm` : '—'}
        />
        <DetailItem
          label="Cadencia máxima"
          value={activity.max_cadence ? `${Math.round(activity.max_cadence)} rpm` : '—'}
        />
        <DetailItem
          label="Carga de entrenamiento"
          value={activity.training_load ? `${Math.round(activity.training_load)}` : '—'}
        />
        <DetailItem
          label="Factor de intensidad"
          value={activity.intensity_factor ? `${activity.intensity_factor.toFixed(2)}` : '—'}
        />
        <DetailItem label="Calorías" value={activity.calories ? `${Math.round(activity.calories)} kcal` : '—'} />
        <DetailItem
          label="Temp. corporal media"
          value={activity.avg_temperature != null ? `${activity.avg_temperature.toFixed(1)} °C` : '—'}
        />
        <DetailItem
          label="Temp. corporal máxima"
          value={activity.max_temperature != null ? `${activity.max_temperature.toFixed(1)} °C` : '—'}
        />
        <DetailItem
          label="Training Effect (aeróbico)"
          value={activity.training_effect_aerobic != null ? `${activity.training_effect_aerobic.toFixed(1)}` : '—'}
        />
        <DetailItem
          label="Training Effect (anaeróbico)"
          value={activity.training_effect_anaerobic != null ? `${activity.training_effect_anaerobic.toFixed(1)}` : '—'}
        />
        <DetailItem
          label="Respiración media"
          value={activity.avg_respiration_rate != null ? `${activity.avg_respiration_rate.toFixed(1)} rpm` : '—'}
        />
        <DetailItem
          label="Pérdida de sudor"
          value={activity.sweat_loss_ml != null ? `${Math.round(activity.sweat_loss_ml)} ml` : '—'}
        />
        <DetailItem
          label="Carga Garmin"
          value={activity.garmin_training_load != null ? `${Math.round(activity.garmin_training_load)}` : '—'}
        />
      </div>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?date=${localDateKey(activity.start_time, activity.timezone || 'UTC')}`}
            aria-label="Volver al calendario"
          >
            <Button variant="secondary">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{activity.title ?? 'Sin título'}</h1>
            <p className="text-sm text-slate-600">
              {new Date(activity.start_time).toLocaleString('es-AR')}
              {activity.source === 'manual' && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Importado
                </span>
              )}
            </p>
          </div>
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
          <p className="text-sm text-slate-700">{activity.description}</p>
        </Card>
      )}

      <ActivityCharts
        activity={activityWithMetrics}
        samples={samples}
        afterMap={
          <>
            {details}
            <ActivityLaps laps={laps} />
          </>
        }
      />
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
