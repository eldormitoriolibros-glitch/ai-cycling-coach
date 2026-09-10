import { NextResponse } from 'next/server'
import { rebuildCalendarPage } from '@/lib/garmin/rebuild'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rebuilds the calendar from Garmin's activity list, one page per call.
 * The last page also drops the old CSV leftovers and pulls Strava gaps.
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
    const result = await rebuildCalendarPage(user.id, cursor)
    if (result.error) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo reconstruir el calendario.' },
      { status: 500 }
    )
  }
}
