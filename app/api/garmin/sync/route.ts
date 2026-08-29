import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/env'
import { syncGarminData } from '@/lib/garmin/sync-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Manual sync: authenticated user triggers their own sync. */
export async function POST(request: Request) {
  // Check if this is a cron call (syncs all users)
  const cronSecret = request.headers.get('x-cron-secret')
  const cron = cronEnv()
  if (cronSecret && cron && cronSecret === cron.CRON_SECRET) {
    return handleCronSync()
  }

  // Otherwise it's a manual sync for the authenticated user
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const result = await syncGarminData(user.id)
    return NextResponse.json(result)
  } catch (err) {
    const admin = createAdminClient()
    await admin
      .from('garmin_connections')
      .update({ last_sync_error: err instanceof Error ? err.message : 'Error desconocido', updated_at: new Date().toISOString() } as any)
      .eq('user_id', user.id)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error de sincronización' }, { status: 500 })
  }
}

/** Cron: sync all users with active Garmin connections. */
async function handleCronSync() {
  const admin = createAdminClient()
  const { data: connections } = await admin
    .from('garmin_connections')
    .select('user_id')
    .eq('sync_enabled', true)

  const results = []
  for (const conn of connections ?? []) {
    try {
      const result = await syncGarminData(conn.user_id)
      results.push({ userId: conn.user_id, ...result })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown'
      console.error(`Garmin cron sync failed for ${conn.user_id}:`, errMsg)
      await admin
        .from('garmin_connections')
        .update({ last_sync_error: errMsg, updated_at: new Date().toISOString() } as any)
        .eq('user_id', conn.user_id)
      results.push({ userId: conn.user_id, error: errMsg })
    }
  }

  return NextResponse.json({ synced: results.length, results })
}
