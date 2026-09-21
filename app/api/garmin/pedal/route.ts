import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeEqual } from '@/lib/crypto'
import { cronEnv } from '@/lib/env'
import { backfillRecentPedalMetrics } from '@/lib/garmin/pedal-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** Recovers pedal metrics for the latest power-meter rides. */
export async function POST(request: Request) {
  const cronSecret = request.headers.get('x-cron-secret')
  const cron = cronEnv()
  if (cronSecret && cron && safeEqual(cronSecret, cron.CRON_SECRET)) {
    const admin = createAdminClient()
    const { data: connections } = await admin
      .from('garmin_connections')
      .select('user_id')
      .eq('sync_enabled', true)
    const results = []
    for (const conn of connections ?? []) {
      results.push(await backfillRecentPedalMetrics(conn.user_id, { limit: 3 }))
    }
    return NextResponse.json({ results })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const result = await backfillRecentPedalMetrics(user.id, { limit: 3 })
    if (result.error) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo recuperar el pedaleo.' },
      { status: 500 }
    )
  }
}
