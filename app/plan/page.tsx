import { PlanBoard } from '@/components/PlanBoard'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Plan</h1>
        <p className="text-sm text-slate-600">Iniciá sesión para ver y gestionar tu plan.</p>
      </div>
    )
  }

  const { data: workouts } = await supabase
    .from('workouts')
    .select(
      'id, scheduled_date, workout_type, title, description, duration_minutes, target_zone, target_power, target_hr, purpose, rationale, status'
    )
    .eq('user_id', user.id)
    .gte('scheduled_date', from)
    .order('scheduled_date', { ascending: true })
    .limit(60)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plan</h1>
      <p className="text-sm text-slate-600">
        La semana se calcula con reglas fijas a partir de tu carga, tu forma y tu disponibilidad. El
        entrenador solo explica el resultado, no inventa los números.
      </p>

      <PlanBoard workouts={workouts ?? []} />
    </div>
  )
}
