import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { sendSessionReview } from '@/lib/coach/session-review'
import { cronEnv } from '@/lib/env'
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

  const { data: users } = await supabase
    .from('users')
    .select('id, timezone, telegram_chat_id')
    .not('telegram_chat_id', 'is', null)

  const results: Array<{ userId: string; synced?: number; reviews: number; error?: string }> = []

  for (const user of users ?? []) {
    try {
      const { data: connection } = await supabase
        .from('strava_connections')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const sync = connection ? await syncActivities(user.id, 'cron') : null
      await reconcileWorkouts(user.id)

      const reviews = await reviewPendingSessions(user.id, user.timezone || 'UTC')
      results.push({ userId: user.id, synced: sync?.synced, reviews })
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
