import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { WeeklyCalendarStrip } from '@/components/calendar/WeeklyCalendarStrip'
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection'
import { TrainingLoadDashboard } from '@/components/TrainingLoadDashboard'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { href: '/coach', title: 'Entrenador', description: 'Preguntale qué entrenar hoy y por qué.' },
  { href: '/plan', title: 'Plan', description: 'Proponé y aprobá la semana de entrenamiento.' },
  { href: '/calendar', title: 'Calendario', description: 'Vista mensual, semestral o anual de actividades.' },
  { href: '/power', title: 'Potencia', description: 'Curva de potencia, FTP estimado y zonas.' },
  { href: '/recovery', title: 'Recuperación', description: 'Sueño, FC en reposo, HRV y sensaciones.' },
  { href: '/profile', title: 'Perfil ciclista', description: 'Datos personales, FTP y frecuencias cardíacas.' },
  { href: '/availability', title: 'Disponibilidad', description: 'Horas por día para bici y fuerza.' },
  { href: '/settings', title: 'Conexiones', description: 'Conectá Garmin y Telegram.' },
]

export default async function HomePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: load }] = await Promise.all([
    supabase.from('users').select('name').eq('id', user!.id).maybeSingle(),
    supabase
      .from('training_load')
      .select('date, chronic_load, acute_load, form, ramp_rate')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel</h1>
        <p className="text-muted">Hola, {profile?.name || user?.email || 'ciclista'}.</p>
      </div>

      <WeeklyCalendarStrip />

      {load && (
        <CollapsibleSection
          title="Estado de forma"
          defaultOpen
          summary={
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Fitness (CTL)" value={fmt(load.chronic_load)} />
              <Metric label="Fatiga (ATL)" value={fmt(load.acute_load)} />
              <Metric label="Forma (TSB)" value={fmt(load.form)} />
              <Metric label="Rampa 7d" value={fmt(load.ramp_rate)} />
            </dl>
          }
        >
          <p className="text-sm text-muted">{describeForm(load.form)}</p>
          <p className="mt-2 text-xs text-muted">
            Valores calculados por esta app a partir de tus datos, no provistos por Strava.
          </p>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Gráficos de carga" defaultOpen={false}>
        <TrainingLoadDashboard days={42} compact showStats={false} />
      </CollapsibleSection>

      <details className="group rounded-lg border border-surface bg-surface shadow-sm">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium uppercase tracking-wide text-muted [&::-webkit-details-marker]:hidden">
          Accesos rápidos
        </summary>
        <div className="border-t border-surface p-4 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-lg border border-surface bg-background p-4 shadow-sm transition hover:shadow-md"
              >
                <h2 className="font-bold">{section.title}</h2>
                <p className="text-sm text-muted">{section.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-lg font-semibold text-foreground">{value}</dd>
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
