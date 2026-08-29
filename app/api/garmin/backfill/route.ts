import { NextResponse } from 'next/server'
import { resetBackfill, runBackfillChunk } from '@/lib/garmin/backfill'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Imports the user's Garmin history one chunk at a time. The client calls this
 * repeatedly until `done` so a multi-hundred-activity history can't blow the
 * function timeout, and progress survives a page reload.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let restart = false
  try {
    const body = await request.json()
    restart = body?.restart === true
  } catch {
    // no body -- continue from stored cursor
  }

  if (restart) await resetBackfill(user.id)

  const progress = await runBackfillChunk(user.id)
  return NextResponse.json(progress, { status: progress.status === 'error' ? 500 : 200 })
}

/** Current backfill progress, for rendering the bar on load. */
export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('garmin_connections')
    .select('backfill_status, backfill_cursor, backfill_processed, backfill_error, backfill_started_at, backfill_finished_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json(data ?? { backfill_status: 'idle', backfill_processed: 0 })
}
