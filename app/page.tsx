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
import { FormStatusChips, FormStatusMeters } from '@/components/dashboard/FormStatusMeters'
import { ReadinessMeter } from '@/components/dashboard/ReadinessMeter'
import { TrainingLoadDashboard } from '@/components/TrainingLoadDashboard'
import { assessFormStatus } from '@/lib/training/form-status'
import { readinessFrom } from '@/lib/training/readiness-input'

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

  const historyFrom = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)

  const [{ data: profile }, { data: loadHistory }, { data: recovery }, { data: sleep }] = await Promise.all([
    supabase.from('users').select('name, timezone').eq('id', user!.id).maybeSingle(),
    supabase
      .from('training_load')
      .select('date, chronic_load, acute_load, form, ramp_rate')
      .eq('user_id', user!.id)
      .gte('date', historyFrom)
      .order('date', { ascending: true }),
    supabase
      .from('recovery_metrics')
      .select('resting_hr, hrv, stress, soreness, motivation, body_battery_high, spo2_avg')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(7),
    supabase
      .from('sleep')
      .select('duration_minutes, sleep_score')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(7),
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
            {status ? status.summary : 'Sincronizá tus actividades para empezar a ver tu carga.'}
          </p>
        </div>
      </section>

      <WeeklyCalendarStrip />

      {status && (
        <CollapsibleSection
          title="Estado de forma"
          defaultOpen
          summary={<FormStatusChips metrics={[status.form, status.fatigue, status.fitness, status.ramp]} />}
        >
          <FormStatusMeters
            form={status.form}
            fatigue={status.fatigue}
            fitness={status.fitness}
            ramp={status.ramp}
          />
          <div className="mt-4">
            <ReadinessMeter readiness={readiness} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Forma y rampa usan rangos típicos de ciclismo. Fitness se compara con tu CTL de los últimos 90 días;
            fatiga se mide como ATL/CTL. Los cuatro salen solo de tus actividades; el readiness es el único que
            suma sueño y sensaciones. Valores calculados por esta app, no por Strava ni Garmin.
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

function formatToday(timezone?: string | null): string {
  const label = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone || 'America/Argentina/Buenos_Aires',
  }).format(new Date())
  return label.charAt(0).toUpperCase() + label.slice(1)
}
