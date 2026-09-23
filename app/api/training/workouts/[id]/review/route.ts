import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { closeSession } from '@/lib/training/close-session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Post-session review on request. Marking a session done already closes it out
 * in the background, so this is the retry: the athlete asking again for a
 * session whose ride or review never landed. It waits for the whole thing.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: workout } = await supabase
    .from('workouts')
    .select('id, status, review_sent_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!workout) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  if (workout.status !== 'completed') {
    return NextResponse.json({ error: 'La sesión todavía no está marcada como hecha.' }, { status: 400 })
  }
  if (workout.review_sent_at) return NextResponse.json({ sent: false, reason: 'already_sent' })

  try {
    const result = await closeSession(user.id, params.id)
    return NextResponse.json({ sent: result.reviewSent, syncError: result.syncError })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo generar la devolución.' },
      { status: 500 }
    )
  }
}
