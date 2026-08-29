import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { localDateKey } from './dates'

export type ReplanVerdict = {
  shouldReplan: boolean
  reasons: string[]
  remainingWorkouts: number
  loadDeficit: number
  loadSurplus: number
}

export async function checkReplan(userId: string): Promise<ReplanVerdict> {
  const supabase = createAdminClient()
  const { data: plan } = await supabase
    .from('plan_weeks')
    .select('start_date, end_date, target_load, planned_load')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return { shouldReplan: false, reasons: [], remainingWorkouts: 0, loadDeficit: 0, loadSurplus: 0 }

  const today = localDateKey(new Date(), 'UTC')
  if (today > plan.end_date) return { shouldReplan: false, reasons: [], remainingWorkouts: 0, loadDeficit: 0, loadSurplus: 0 }

  const { data: remaining } = await supabase
    .from('workouts')
    .select('scheduled_date, duration_minutes, status')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('scheduled_date', today)
    .lte('scheduled_date', plan.end_date)

  const { data: past } = await supabase
    .from('workouts')
    .select('status, duration_minutes')
    .eq('user_id', userId)
    .gte('scheduled_date', plan.start_date)
    .lt('scheduled_date', today)

  // Estimate load from duration (rough approximation: ~1 TSS per minute at moderate intensity)
  const completedLoad = (past ?? []).filter((w) => w.status === 'completed').reduce((s, w) => s + (w.duration_minutes ?? 0), 0)
  const skippedLoad = (past ?? []).filter((w) => w.status === 'skipped').reduce((s, w) => s + (w.duration_minutes ?? 0), 0)
  const remainingPlannedLoad = (remaining ?? []).reduce((s, w) => s + (w.duration_minutes ?? 0), 0)

  const target = Number(plan.target_load ?? 0)
  const loadDeficit = Math.round(skippedLoad)
  const reasons: string[] = []
  let shouldReplan = false

  if (target > 0 && loadDeficit / Math.max(1, target) > 0.2) {
    shouldReplan = true
    reasons.push('Se perdió más del 20% de la carga semanal')
  }
  if ((remaining ?? []).length === 0 && today <= plan.end_date) {
    shouldReplan = true
    reasons.push('No quedan sesiones programadas para el resto de la semana')
  }

  return {
    shouldReplan,
    reasons,
    remainingWorkouts: (remaining ?? []).length,
    loadDeficit,
    loadSurplus: 0,
  }
}

