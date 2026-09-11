import { createClient } from '@/lib/supabase/client'
import type { WorkoutStatus } from '@/lib/types/database'

export async function updateWorkoutStatus(id: string, status: WorkoutStatus): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('workouts').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function requestSessionReview(id: string): Promise<{ sent: boolean }> {
  const response = await fetch(`/api/training/workouts/${id}/review`, { method: 'POST' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? 'No se pudo generar la devolución.')
  return { sent: Boolean(body.sent) }
}
