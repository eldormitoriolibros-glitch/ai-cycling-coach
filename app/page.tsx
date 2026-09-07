import Link from 'next/link'
import {
  CalendarDays,
  Clock,
  HeartPulse,
  ListChecks,
  MessageSquare,
  Plug,
  User,
  Zap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { WeeklyCalendarStrip } from '@/components/calendar/WeeklyCalendarStrip'
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection'
import { TrainingLoadDashboard } from '@/components/TrainingLoadDashboard'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { href: '/coach', title: 'Entrenador', description: 'Preguntale qué entrenar hoy y por qué.', icon: MessageSquare },
  { href: '/plan', title: 'Plan', description: 'Proponé y aprobá la semana de entrenamiento.', icon: ListChecks },
  { href: '/calendar', title: 'Calendario', description: 'Vista mensual, semestral o anual de actividades.', icon: CalendarDays },
  { href: '/power', title: 'Potencia', description: 'Curva de potencia, FTP estimado y zonas.', icon: Zap },
  { href: '/recovery', title: 'Recuperación', description: 'Sueño, FC en reposo, HRV y sensaciones.', icon: HeartPulse },
  { href: '/profile', title: 'Perfil ciclista', description: 'Datos personales, FTP y frecuencias cardíacas.', icon: User },
  { href: '/availability', title: 'Disponibilidad', description: 'Horas por día para bici y fuerza.', icon: Clock },
  { href: '/settings', title: 'Conexiones', description: 'Conectá Garmin y Telegram.', icon: Plug },
]

export default async function HomePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: load }] = await Promise.all([
    supabase.from('users').select('name, timezone').eq('id', user!.id).maybeSingle(),
    supabase
      .from('training_load')
      .select('date, chronic_load, acute_load, form, ramp_rate')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const firstName = (profile?.name || user?.email?.split('@')[0] || 'ciclista').split(' ')[0]

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-surface bg-surface p-5 shadow-sm sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent-500/15 blur-3xl"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600 dark:text-accent-400">
            {formatToday(profile?.timezone)}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
            Hola, {firstName}.
          </h1>
          <p className="mt-1 text-sm text-muted">
            {load ? describeForm(load.form) : 'Sincronizá tus actividades para empezar a ver tu carga.'}
          </p>
        </div>
      </section>

      <WeeklyCalendarStrip />

      {load && (
        <CollapsibleSection
          title="Estado de forma"
          defaultOpen
          summary={
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Fitness (CTL)" value={fmt(load.chronic_load)} />
              <Metric label="Fatiga (ATL)" value={fmt(load.acute_load)} />
              <Metric label="Forma (TSB)" value={fmt(load.form)} tone={formTone(load.form)} />
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

      <CollapsibleSection title="Gráficos de carga" defaultOpen>
        <TrainingLoadDashboard days={42} compact showStats={false} />
      </CollapsibleSection>

      <CollapsibleSection title="Accesos rápidos">
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex items-start gap-3 rounded-xl border border-surface bg-background p-4 shadow-sm transition hover:border-accent-500/40 hover:shadow-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600 transition group-hover:bg-accent-500/20 dark:text-accent-400">
                <section.icon aria-hidden className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{section.title}</span>
                <span className="block text-sm text-muted">{section.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-lg font-semibold ${tone || 'text-foreground'}`}>{value}</dd>
    </div>
  )
}

function fmt(value: number | null): string {
  return value === null ? '—' : Math.round(value).toString()
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

function formTone(tsb: number | null): string {
  if (tsb === null) return 'text-foreground'
  if (tsb > 5) return 'text-emerald-400'
  if (tsb > -10) return 'text-foreground'
  if (tsb > -30) return 'text-amber-400'
  return 'text-red-400'
}

function describeForm(tsb: number | null): string {
  if (tsb === null) return 'Sin datos suficientes todavía.'
  if (tsb > 20) return 'Muy descansado. Buen momento para competir, o para volver a cargar.'
  if (tsb > 5) return 'Fresco. Listo para una sesión de calidad.'
  if (tsb > -10) return 'Equilibrado. Podés seguir con el plan.'
  if (tsb > -30) return 'Cargado. Normal en una semana fuerte; cuidá el descanso.'
  return 'Muy fatigado. Considerá bajar la carga unos días.'
}
