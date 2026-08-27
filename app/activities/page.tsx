import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Alert, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { formatDistance, formatDuration } from '@/lib/utils'
import { SyncUnsyncedButton } from '@/components/SyncUnsyncedButton'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const requestedPage = Number.parseInt(searchParams.page ?? '1', 10)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const from = (page - 1) * PAGE_SIZE

  const countOf = (column: string, isNull: boolean) =>
    isNull
      ? supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .is(column, null)
      : supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .not(column, 'is', null)

  const [
    { data: activities, count, error },
    { count: missingLoad },
    { count: withPower },
    { count: withHr },
    { count: withCurve },
    { data: metrics },
  ] = await Promise.all([
    supabase
      .from('activities')
      .select('*', { count: 'exact' })
      .eq('user_id', user!.id)
      .order('start_time', { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    countOf('training_load', true),
    countOf('avg_power', false),
    countOf('avg_hr', false),
    countOf('power_curve', false),
    supabase.from('athlete_metrics').select('ftp, max_hr').eq('user_id', user!.id).maybeSingle(),
  ])

  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Actividades</h1>
        <p className="text-sm text-slate-500">
          {total} en total · página {page} de {lastPage}
        </p>
      </div>

      <SyncUnsyncedButton />

      {error && <Card>No se pudieron cargar las actividades: {error.message}</Card>}

      {(missingLoad ?? 0) > 0 && (
        <Alert variant="info">
          {missingLoad} actividad(es) sin carga calculada.{' '}
          {(withPower ?? 0) > 0 && !metrics?.ftp ? (
            <>
              Tenés potencia pero falta tu FTP.{' '}
              {(withCurve ?? 0) > 0 ? (
                <>
                  <Link href="/power" className="font-medium underline">
                    Estimalo desde tu historial
                  </Link>{' '}
                  o cargalo a mano en el perfil.
                </>
              ) : (
                <>
                  Cargalo a mano en{' '}
                  <Link href="/profile" className="font-medium underline">
                    Perfil
                  </Link>
                  ; tu potencia es estimada por Strava y no alcanza para deducirlo.
                </>
              )}
            </>
          ) : (withHr ?? 0) === 0 && !metrics?.max_hr ? (
            <>Cargá tu FC máxima en el perfil para estimar la carga por pulso.</>
          ) : (
            <>Son salidas sin potencia ni pulso, así que no hay nada que calcular.</>
          )}
        </Alert>
      )}

      {!error && total === 0 && (
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
          <Link key={activity.id} href={`/activities/${activity.id}`} className="block">
            <Card className="p-4 transition hover:brightness-95 cursor-pointer">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium text-foreground">
                  {activity.title ?? 'Sin título'}
                  {activity.source === 'manual' && (
                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      CSV
                    </span>
                  )}
                </h2>
                <time className="text-xs text-muted" dateTime={activity.start_time}>
                  {new Date(activity.start_time).toLocaleString('es-AR')}
                </time>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
                <Stat label="Distancia" value={formatDistance(activity.distance_meters)} />
                <Stat
                  label="Tiempo"
                  value={formatDuration(activity.moving_seconds ?? activity.duration_seconds)}
                />
                <Stat label="Pulso" value={activity.avg_hr ? `${activity.avg_hr} ppm` : '—'} />
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
                <Stat
                  label="Carga"
                  value={activity.training_load ? String(activity.training_load) : '—'}
                />
              </dl>
            </Card>
          </Link>
        ))}
      </div>

      {lastPage > 1 && (
        <nav className="flex items-center justify-between pt-2">
          <PageLink page={page - 1} disabled={page <= 1}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
            Más recientes
          </PageLink>
          <PageLink page={page + 1} disabled={page >= lastPage}>
            Más antiguas
            <ChevronRight aria-hidden className="h-4 w-4" />
          </PageLink>
        </nav>
      )}
    </div>
  )
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-surface px-3 py-2 text-sm text-muted">
        {children}
      </span>
    )
  }

  return (
    <Link
      href={`/activities?page=${page}`}
      className="inline-flex items-center gap-1 rounded-md border border-surface bg-surface px-3 py-2 text-sm font-medium hover:brightness-95"
    >
      {children}
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}
