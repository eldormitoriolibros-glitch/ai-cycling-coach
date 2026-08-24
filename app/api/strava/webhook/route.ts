import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { serverEnv } from '@/lib/env'
import { deleteActivity, syncSingleActivity } from '@/lib/strava/sync'
import { findUserByAthleteId } from '@/lib/strava/tokens'
import { stravaWebhookEventSchema } from '@/lib/strava/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Strava webhook.
 *
 * GET  — one-time subscription validation handshake.
 * POST — activity/athlete events. Strava expects a 200 within 2 seconds and
 *        retries otherwise, so failures are logged, never surfaced as 5xx.
 *
 * Register the subscription once with:
 *   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
 *     -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
 *     -F callback_url=https://<your-domain>/api/strava/webhook \
 *     -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  if (!safeEqual(token, serverEnv().STRAVA_WEBHOOK_VERIFY_TOKEN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ 'hub.challenge': challenge })
}

export async function POST(request: Request) {
  const parsed = stravaWebhookEventSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: true })

  const event = parsed.data

  try {
    const userId = await findUserByAthleteId(event.owner_id)
    if (!userId) return NextResponse.json({ ok: true })

    if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
      await createAdminClient().from('strava_connections').delete().eq('user_id', userId)
      return NextResponse.json({ ok: true })
    }

    if (event.object_type === 'activity') {
      if (event.aspect_type === 'delete') {
        await deleteActivity(userId, event.object_id)
      } else {
        await syncSingleActivity(userId, event.object_id)
      }
    }
  } catch (err) {
    // Swallow: a non-200 makes Strava retry the same event indefinitely.
    console.error('Strava webhook processing failed', err)
  }

  return NextResponse.json({ ok: true })
}
