import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { cronEnv } from '@/lib/env'
import { syncGarminData } from '@/lib/garmin/sync-service'
import { syncActivities } from '@/lib/strava/sync'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileWorkouts } from '@/lib/training/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily job: pull new rides and close out past sessions.
 *
 * Reviews stay off this path. The athlete gets one when they mark a session
 * done or ask for it, not when the cron infers that a ride happened.
 *
 * Wired up in vercel.json. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const env = cronEnv()
  if (!env) {
    return NextResponse.json({ error: 'CRON_SECRET no está configurado.' }, { status: 503 })
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token || !safeEqual(token, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const [{ data: users }, { data: garminUsers }, { data: stravaUsers }] = await Promise.all([
    supabase.from('users').select('id'),
    supabase.from('garmin_connections').select('user_id').eq('sync_enabled', true),
    supabase.from('strava_connections').select('user_id'),
  ])

  const hasGarmin = new Set((garminUsers ?? []).map((row) => row.user_id))
  const hasStrava = new Set((stravaUsers ?? []).map((row) => row.user_id))

  const results: Array<{ userId: string; synced?: number; error?: string }> = []

  for (const user of users ?? []) {
    try {
      let synced = 0
      // Garmin is the primary source; Strava only fills gaps for whoever uses it.
      if (hasGarmin.has(user.id)) {
        const garmin = await syncGarminData(user.id).catch(() => null)
        synced += (garmin?.activitiesCreated ?? 0) + (garmin?.activitiesFromList ?? 0)
      }
      if (hasStrava.has(user.id)) {
        const strava = await syncActivities(user.id, 'cron').catch(() => null)
        synced += strava?.synced ?? 0
      }

      await reconcileWorkouts(user.id)
      results.push({ userId: user.id, synced })
    } catch (err) {
      results.push({
        userId: user.id,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
