import { NextResponse } from 'next/server'
import { backfillGarminLaps } from '@/lib/garmin/laps-backfill'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Fetches lap splits for rides imported before laps were stored. One page per
 * call: the client keeps calling with the returned cursor until `done`.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const cursor = Number.isFinite(body?.cursor) ? Math.max(0, Math.round(body.cursor)) : 0

  try {
    const result = await backfillGarminLaps(user.id, cursor)
    if (result.error) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudieron traer las vueltas.' },
      { status: 500 }
    )
  }
}
