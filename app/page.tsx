import Link from 'next/link'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { formatDistance, formatDuration } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { href: '/coach', title: 'Entrenador', description: 'Preguntale qué entrenar hoy y por qué.' },
  { href: '/plan', title: 'Plan', description: 'Proponé y aprobá la semana de entrenamiento.' },
  { href: '/activities', title: 'Actividades', description: 'Tus salidas sincronizadas desde Strava.' },
  { href: '/power', title: 'Potencia', description: 'Curva de potencia, FTP estimado y zonas.' },
  { href: '/recovery', title: 'Recuperación', description: 'Sueño, FC en reposo, HRV y sensaciones.' },
  { href: '/profile', title: 'Perfil ciclista', description: 'Datos personales, FTP y frecuencias cardíacas.' },
  { href: '/availability', title: 'Disponibilidad', description: 'Días y horarios en los que podés entrenar.' },
  { href: '/settings', title: 'Conexiones', description: 'Conectá Strava y Telegram.' },
]

export default async function HomePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

  const [{ data: profile }, { data: recent }, { data: load }] = await Promise.all([
    supabase.from('users').select('name').eq('id', user!.id).maybeSingle(),
    supabase
      .from('activities')
      .select('distance_meters, moving_seconds, duration_seconds, training_load')
      .eq('user_id', user!.id)
      .gte('start_time', sevenDaysAgo),
    supabase
      .from('training_load')
      .select('date, chronic_load, acute_load, form, ramp_rate')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const week = (recent ?? []).reduce(
    (acc, a) => ({
      count: acc.count + 1,
      distance: acc.distance + (a.distance_meters ?? 0),
      seconds: acc.seconds + (a.moving_seconds ?? a.duration_seconds ?? 0),
      load: acc.load + (a.training_load ?? 0),
    }),
    { count: 0, distance: 0, seconds: 0, load: 0 }
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel</h1>
        <p className="text-slate-600">Hola, {profile?.name || user?.email || 'ciclista'}.</p>
      </div>

      <Card>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Últimos 7 días</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Salidas" value={String(week.count)} />
          <Metric label="Distancia" value={formatDistance(week.distance)} />
          <Metric label="Tiempo" value={formatDuration(week.seconds)} />
          <Metric label="Carga total" value={week.load ? Math.round(week.load).toString() : '—'} />
        </dl>
      </Card>

      {load && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Estado de forma
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Fitness (CTL)" value={fmt(load.chronic_load)} />
            <Metric label="Fatiga (ATL)" value={fmt(load.acute_load)} />
            <Metric label="Forma (TSB)" value={fmt(load.form)} />
            <Metric label="Rampa 7d" value={fmt(load.ramp_rate)} />
          </dl>
          <p className="mt-3 text-sm text-slate-600">{describeForm(load.form)}</p>
          <p className="mt-1 text-xs text-slate-400">
            Valores calculados por esta app a partir de tus datos, no provistos por Strava.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <h2 className="font-bold">{section.title}</h2>
            <p className="text-sm text-slate-600">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-xl font-semibold text-slate-900">{value}</dd>
    </div>
  )
}

function fmt(value: number | null): string {
  return value === null ? '—' : Math.round(value).toString()
}

function describeForm(tsb: number | null): string {
  if (tsb === null) return 'Sin datos suficientes todavía.'
  if (tsb > 20) return 'Muy descansado. Buen momento para competir, o para volver a cargar.'
  if (tsb > 5) return 'Fresco. Listo para una sesión de calidad.'
  if (tsb > -10) return 'Equilibrado. Podés seguir con el plan.'
  if (tsb > -30) return 'Cargado. Normal en una semana fuerte; cuidá el descanso.'
  return 'Muy fatigado. Considerá bajar la carga unos días.'
}
