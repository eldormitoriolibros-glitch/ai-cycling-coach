import { NextResponse } from 'next/server'
import { linkCompletedActivity, sendSessionReview } from '@/lib/coach/session-review'
import { syncGarminData } from '@/lib/garmin/sync-service'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CYCLING_TYPES = new Set(['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2max'])

/**
 * Post-session review for a workout the athlete just finished. Pulls the ride
 * first when it isn't linked yet, otherwise the coach would grade a session it
 * cannot see.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: workout } = await supabase
    .from('workouts')
    .select('id, workout_type, status, completed_activity_id, review_sent_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!workout) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  if (workout.status !== 'completed') {
    return NextResponse.json({ error: 'La sesión todavía no está marcada como hecha.' }, { status: 400 })
  }

  const isRide = !workout.workout_type || CYCLING_TYPES.has(workout.workout_type)
  if (isRide && !workout.completed_activity_id) {
    await syncGarminData(user.id).catch(() => null)
    await linkCompletedActivity(user.id, params.id).catch(() => null)
  }

  if (workout.review_sent_at) return NextResponse.json({ sent: false, reason: 'already_sent' })

  try {
    const sent = await sendSessionReview(user.id, params.id)
    return NextResponse.json({ sent })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo generar la devolución.' },
      { status: 500 }
    )
  }
}
