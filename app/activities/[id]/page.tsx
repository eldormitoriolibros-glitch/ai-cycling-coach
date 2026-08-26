import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { ActivityCharts } from '@/components/ActivityCharts'
import { Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { formatDistance, formatDuration } from '@/lib/utils'
import type { ActivityRow } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

export default async function ActivityDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return notFound()
  }

  const [{ data: activity }, { data: metrics }] = await Promise.all([
    supabase.from('activities').select('*').eq('id', params.id).eq('user_id', user.id).maybeSingle(),
    supabase.from('athlete_metrics').select('ftp, max_hr').eq('user_id', user.id).maybeSingle(),
  ])

  if (!activity) {
    return notFound()
  }

  const activityWithMetrics = {
    ...activity,
    ftp: metrics?.ftp ?? undefined,
    maxHr: metrics?.max_hr ?? undefined,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/activities">
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

      {/* Description */}
      {activity.description && (
        <Card>
          <p className="text-sm text-slate-700">{activity.description}</p>
        </Card>
      )}

      {/* Charts and Analysis */}
      <ActivityCharts activity={activityWithMetrics} />

      {/* Details */}
      <Card className="space-y-4">
        <h2 className="font-semibold">Detalles de la actividad</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailItem label="Tipo" value={activity.sport_type ?? activity.activity_type ?? '—'} />
          <DetailItem
            label="Distancia"
            value={
              activity.distance_meters ? formatDistance(activity.distance_meters) : '—'
            }
          />
          <DetailItem
            label="Duración total"
            value={
              activity.duration_seconds ? formatDuration(activity.duration_seconds) : '—'
            }
          />
          <DetailItem
            label="Tiempo en movimiento"
            value={
              activity.moving_seconds ? formatDuration(activity.moving_seconds) : '—'
            }
          />
          <DetailItem
            label="Elevación"
            value={activity.elevation_gain_meters ? `${Math.round(activity.elevation_gain_meters)} m` : '—'}
          />
          <DetailItem
            label="Velocidad media"
            value={
              activity.avg_speed
                ? `${(activity.avg_speed * 3.6).toFixed(1)} km/h`
                : '—'
            }
          />
          <DetailItem label="Pulso medio" value={activity.avg_hr ? `${activity.avg_hr} ppm` : '—'} />
          <DetailItem label="Pulso máximo" value={activity.max_hr ? `${activity.max_hr} ppm` : '—'} />
          <DetailItem
            label="Potencia media"
            value={
              activity.avg_power
                ? `${Math.round(activity.avg_power)} W`
                : '—'
            }
          />
          <DetailItem
            label="Potencia normalizada"
            value={
              activity.normalized_power
                ? `${Math.round(activity.normalized_power)} W`
                : '—'
            }
          />
          <DetailItem label="Potencia máxima" value={activity.max_power ? `${Math.round(activity.max_power)} W` : '—'} />
          <DetailItem label="Cadencia media" value={activity.avg_cadence ? `${Math.round(activity.avg_cadence)} rpm` : '—'} />
          <DetailItem
            label="Carga de entrenamiento"
            value={activity.training_load ? `${Math.round(activity.training_load)}` : '—'}
          />
          <DetailItem
            label="Factor de intensidad"
            value={activity.intensity_factor ? `${activity.intensity_factor.toFixed(2)}` : '—'}
          />
        </div>
      </Card>
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
