import Link from 'next/link'
import { Alert, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { formatDistance, formatDuration } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ActivitiesPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: activities, error }, { data: metrics }] = await Promise.all([
    supabase
      .from('activities')
      .select('*')
      .eq('user_id', user!.id)
      .order('start_time', { ascending: false })
      .limit(50),
    supabase.from('athlete_metrics').select('ftp, max_hr').eq('user_id', user!.id).maybeSingle(),
  ])

  const missingLoad = (activities ?? []).filter((a) => a.training_load === null)
  const hasPowerData = (activities ?? []).some((a) => a.avg_power !== null)
  const hasHrData = (activities ?? []).some((a) => a.avg_hr !== null)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Actividades</h1>

      {error && <Card>No se pudieron cargar las actividades: {error.message}</Card>}

      {missingLoad.length > 0 && (
        <Alert variant="info">
          {missingLoad.length} actividad(es) sin carga calculada.{' '}
          {hasPowerData && !metrics?.ftp ? (
            <>
              Tenés potencia pero falta tu FTP:{' '}
              <Link href="/power" className="font-medium underline">
                estimalo desde tu historial
              </Link>{' '}
              o cargalo a mano en el perfil.
            </>
          ) : !hasPowerData && !hasHrData ? (
            <>Estas salidas no tienen ni potencia ni pulso, así que no hay nada que calcular.</>
          ) : !hasHrData && !metrics?.max_hr ? (
            <>Cargá tu FC máxima en el perfil para estimar la carga por pulso.</>
          ) : (
            <>Sincronizá de nuevo para procesar los datos de potencia que faltan.</>
          )}
        </Alert>
      )}

      {!error && (!activities || activities.length === 0) && (
        <Card>
          <p className="text-sm text-slate-600">
            Todavía no hay actividades.{' '}
            <Link href="/settings" className="font-medium underline">
              Conectá Strava
            </Link>{' '}
            y sincronizá para verlas acá.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {activities?.map((activity) => (
          <Card key={activity.id} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">{activity.title ?? 'Sin título'}</h2>
              <time className="text-xs text-slate-500" dateTime={activity.start_time}>
                {new Date(activity.start_time).toLocaleString('es-AR')}
              </time>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Stat label="Distancia" value={formatDistance(activity.distance_meters)} />
              <Stat label="Tiempo" value={formatDuration(activity.moving_seconds ?? activity.duration_seconds)} />
              <Stat
                label={activity.has_power_meter ? 'Potencia' : 'Potencia (est.)'}
                value={
                  activity.normalized_power
                    ? `${Math.round(activity.normalized_power)} W NP`
                    : activity.avg_power
                      ? `${Math.round(activity.avg_power)} W`
                      : '—'
                }
              />
              <Stat label="Carga" value={activity.training_load ? String(activity.training_load) : '—'} />
            </dl>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}
