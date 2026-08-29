import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { serverEnv } from '@/lib/env'
import { deleteActivity, syncSingleActivity } from '@/lib/strava/sync'
import { findUserByAthleteId } from '@/lib/strava/tokens'
import { stravaWebhookEventSchema } from '@/lib/strava/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileWorkouts } from '@/lib/training/reconcile'
import { checkReplan } from '@/lib/training/replan'
import { proposeWeeklyPlan } from '@/lib/training/plan-service'
import { maybeSaveSnapshot } from '@/lib/training/snapshot'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram/client'

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
        // Save a weekly power-curve snapshot (if not already saved this week)
        try {
          await maybeSaveSnapshot(userId)
        } catch (err) {
          console.error('Failed to save power curve snapshot', err)
        }
        // Reconcile scheduled workouts and run a lightweight replan check.
        try {
          await reconcileWorkouts(userId)
          const verdict = await checkReplan(userId)
          if (verdict.shouldReplan) {
            console.log(`Replan recommended for ${userId}:`, verdict.reasons)
            try {
              const proposal = await proposeWeeklyPlan(userId)
              // Lookup telegram chat
              const { data: userRow } = await createAdminClient().from('users').select('telegram_chat_id, name').eq('id', userId).maybeSingle()
              const chatId = userRow?.telegram_chat_id ?? null
              if (chatId && isTelegramConfigured()) {
                const title = `Propuesta automática: ajustar la semana (${proposal.draft.startDate} → ${proposal.draft.endDate})`
                const bodyLines = [
                  title,
                  '',
                  `Enfoque: ${proposal.draft.emphasis} · carga planificada: ${proposal.draft.plannedLoad} · carga objetivo: ${proposal.draft.weeklyTargetLoad}`,
                  '',
                  proposal.rationale ? `Por qué: ${proposal.rationale}` : 'Sin explicación automatizada',
                  '',
                  'Si querés aplicar este cambio contestá "ACEPTAR" en este chat o abrí la app para revisarlo.',
                ]
                const text = bodyLines.join('\n')
                await sendMessage(chatId, text)
                await createAdminClient().from('coach_messages').insert({
                  user_id: userId,
                  direction: 'outbound',
                  channel: 'telegram',
                  message: text,
                  intent: 'replan_suggestion',
                })
              }
            } catch (err) {
              console.error('Failed to propose replan:', err)
            }
          }
        } catch (err) {
          console.error('Replan check failed', err)
        }
      }
    }
  } catch (err) {
    // Swallow: a non-200 makes Strava retry the same event indefinitely.
    console.error('Strava webhook processing failed', err)
  }

  return NextResponse.json({ ok: true })
}
