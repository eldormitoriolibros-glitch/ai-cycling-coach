import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { sendSessionReview } from '@/lib/coach/session-review'
import { cronEnv } from '@/lib/env'
import { syncGarminData } from '@/lib/garmin/sync-service'
import { syncActivities } from '@/lib/strava/sync'
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, localDateKey } from '@/lib/training/dates'
import { reconcileWorkouts } from '@/lib/training/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** How many past days can still get a review, and how many per run. */
const REVIEW_LOOKBACK_DAYS = 3
const MAX_REVIEWS_PER_USER = 2

/**
 * Daily job: pull new rides, close out past sessions, and send the coach's
 * review for whatever got completed since the last run.
 *
 * Runs for every athlete, whether or not they use Telegram: the reconcile and
 * the review both matter on the web too.
 *
 * No daily briefing: the athlete gets feedback when a session is done, not a
 * templated nudge every morning.
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
    supabase.from('users').select('id, timezone'),
    supabase.from('garmin_connections').select('user_id').eq('sync_enabled', true),
    supabase.from('strava_connections').select('user_id'),
  ])

  const hasGarmin = new Set((garminUsers ?? []).map((row) => row.user_id))
  const hasStrava = new Set((stravaUsers ?? []).map((row) => row.user_id))

  const results: Array<{ userId: string; synced?: number; reviews: number; error?: string }> = []

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

      const reviews = await reviewPendingSessions(user.id, user.timezone || 'UTC')
      results.push({ userId: user.id, synced, reviews })
    } catch (err) {
      results.push({
        userId: user.id,
        reviews: 0,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}

/**
 * Reviews sessions that were completed automatically (a ride showed up for a
 * scheduled workout) and therefore never went through the "Hecho" button.
 */
async function reviewPendingSessions(userId: string, timeZone: string): Promise<number> {
  const supabase = createAdminClient()
  const today = localDateKey(new Date(), timeZone)

  const { data: pending } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .is('review_sent_at', null)
    .gte('scheduled_date', addDays(today, -REVIEW_LOOKBACK_DAYS))
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .limit(MAX_REVIEWS_PER_USER)

  let sent = 0
  for (const workout of pending ?? []) {
    const ok = await sendSessionReview(userId, workout.id).catch(() => false)
    if (ok) sent++
  }
  return sent
}
