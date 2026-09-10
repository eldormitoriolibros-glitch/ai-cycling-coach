import { PlanBoard } from '@/components/PlanBoard'
import { createClient } from '@/lib/supabase/server'
import { addDays, localDateKey } from '@/lib/training/dates'
import { looksStrength } from '@/lib/training/split-sessions'

export const dynamic = 'force-dynamic'

export default async function PlanPage({
  searchParams,
}: {
  searchParams?: { date?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Plan</h1>
        <p className="text-sm text-slate-600">Iniciá sesión para ver y gestionar tu plan.</p>
      </div>
    )
  }

  const { data: profile } = await supabase.from('users').select('timezone').eq('id', user.id).maybeSingle()
  const today = localDateKey(new Date(), profile?.timezone || 'UTC')
  const historyFrom = addDays(today, -56)
  const horizon = addDays(today, 35)
  // Deep link from an activity: open the week that holds its session.
  const requested = searchParams?.date
  const focusDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : undefined

  const { data: workouts } = await supabase
    .from('workouts')
    .select(
      'id, scheduled_date, workout_type, title, description, duration_minutes, target_zone, target_power, target_hr, purpose, rationale, status, completed_activity_id'
    )
    .eq('user_id', user.id)
    .gte('scheduled_date', historyFrom)
    .lte('scheduled_date', horizon)
    .order('scheduled_date', { ascending: true })
    .limit(200)

  // Sessions completed before the link existed (or marked done by hand) have no
  // activity id yet; resolve them by day so the shortcut still shows up.
  const { data: rides } = await supabase
    .from('activities')
    .select('id, start_time')
    .eq('user_id', user.id)
    .gte('start_time', `${historyFrom}T00:00:00Z`)
    .order('start_time', { ascending: true })

  const rideByDate = new Map<string, string>()
  for (const ride of rides ?? []) {
    const key = localDateKey(ride.start_time, profile?.timezone || 'UTC')
    if (!rideByDate.has(key)) rideByDate.set(key, ride.id)
  }

  const sessions = (workouts ?? []).map((w) => ({
    ...w,
    completed_activity_id:
      w.completed_activity_id ??
      (w.status === 'completed' && !looksStrength(w.title, w.workout_type)
        ? (rideByDate.get(w.scheduled_date) ?? null)
        : null),
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plan</h1>
      <p className="text-sm text-slate-600">
        Mirás una semana completa o un ciclo de 4. El diseño de cada sesión está en el detalle.
        Para cambiar algo, pedíselo al entrenador por chat o Telegram y confirmá el cambio.
      </p>

      <PlanBoard workouts={sessions} today={today} focusDate={focusDate} />
    </div>
  )
}
