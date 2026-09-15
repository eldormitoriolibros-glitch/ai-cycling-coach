import { createAdminClient } from '@/lib/supabase/admin'
import {
  availabilityRowsFromBrief,
  type TrainingBrief,
} from '@/lib/training/coach-brief'

import 'server-only'

/** Upsert the current brief and, when a typical week was given, the seven availability days. */
export async function persistTrainingBrief(userId: string, brief: TrainingBrief): Promise<void> {
  const supabase = createAdminClient()

  const { error: briefError } = await supabase.from('training_briefs').upsert(
    {
      user_id: userId,
      goal_kind: brief.goal_kind,
      goal_label: brief.goal_label ?? null,
      target_date: brief.target_date ?? null,
      horizon_weeks: brief.horizon_weeks,
      include_strength: brief.include_strength,
      notes: brief.notes ?? null,
    },
    { onConflict: 'user_id' }
  )
  if (briefError) throw briefError

  if (brief.goal_label) {
    await supabase.from('users').update({ cycling_goals: [brief.goal_label] }).eq('id', userId)
  }

  if (!brief.availability.length) return

  const { error: availError } = await supabase.from('availability').upsert(
    availabilityRowsFromBrief(brief).map((day) => ({
      user_id: userId,
      day_of_week: day.day_of_week,
      bike_minutes: day.bike_minutes,
      strength_minutes: day.strength_minutes,
    })),
    { onConflict: 'user_id,day_of_week' }
  )
  if (availError) throw availError
}
