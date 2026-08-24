import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { buildDailyNudge } from '@/lib/coach/nudge'
import { cronEnv } from '@/lib/env'
import { syncActivities } from '@/lib/strava/sync'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { localDateKey } from '@/lib/training/dates'
import { reconcileWorkouts } from '@/lib/training/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily job: pull new rides, close out past sessions, then nudge over Telegram.
 *
 * Wired up in vercel.json. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Hobby plan crons fire once per day at a fixed UTC hour, so the message lands at
 * the same UTC time regardless of the athlete's timezone.
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

  const results: Array<{ userId: string; synced?: number; notified: boolean; error?: string }> = []

  for (const user of users ?? []) {
    try {
      const { data: connection } = await supabase
        .from('strava_connections')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const sync = connection ? await syncActivities(user.id, 'cron') : null
      await reconcileWorkouts(user.id)

      const notified = await notifyOnce(user.id, user.telegram_chat_id!, user.timezone || 'UTC')
      results.push({ userId: user.id, synced: sync?.synced, notified })
    } catch (err) {
      results.push({
        userId: user.id,
        notified: false,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}

/** Idempotent: at most one nudge per athlete per local day. */
async function notifyOnce(userId: string, chatId: number, timeZone: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false

  const supabase = createAdminClient()
  const today = localDateKey(new Date(), timeZone)

  const { data: alreadySent } = await supabase
    .from('coach_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .eq('intent', 'daily_nudge')
    .gte('created_at', `${today}T00:00:00Z`)
    .limit(1)
    .maybeSingle()

  if (alreadySent) return false

  const text = await buildDailyNudge(userId)
  await sendMessage(chatId, text)

  await supabase.from('coach_messages').insert({
    user_id: userId,
    direction: 'outbound',
    channel: 'telegram',
    message: text,
    intent: 'daily_nudge',
  })

  return true
}
