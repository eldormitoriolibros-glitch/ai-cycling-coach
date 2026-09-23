import { NextResponse } from 'next/server'
import { runAfterResponse } from '@/lib/background'
import { createClient } from '@/lib/supabase/server'
import { closeSession } from '@/lib/training/close-session'
import type { WorkoutStatus } from '@/lib/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STATUSES = new Set<WorkoutStatus>(['scheduled', 'completed', 'skipped', 'moved'])

/**
 * Marks a session, and when it is done kicks off the close-out (Garmin pull,
 * link, review) after the response.
 *
 * Marking used to be a browser write to Supabase followed by a second, long
 * request that did the syncing. If that second request never landed the
 * session stayed marked done with no ride behind it and nothing said so. Now
 * both happen server side off one short request.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const status = body?.status as WorkoutStatus | undefined
  if (!status || !STATUSES.has(status)) {
    return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
  }

  const { data: workout, error } = await supabase
    .from('workouts')
    .update({ status })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!workout) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  if (status !== 'completed') return NextResponse.json({ status, closing: false })

  runAfterResponse(`closeSession ${params.id}`, () => closeSession(user.id, params.id))
  return NextResponse.json({ status, closing: true }, { status: 202 })
}
