import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { telegramEnv } from '@/lib/env'
import { askCoach } from '@/lib/coach'
import { buildDailyNudge } from '@/lib/coach/nudge'
import { sendMessage, type TelegramUpdate } from '@/lib/telegram/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HELP = [
  'Soy tu entrenador de ciclismo.',
  '',
  'Escribime lo que quieras, por ejemplo: "¿qué entreno hoy?".',
  'Comando rápido: /hoy te devuelve la sesión del día.',
  '',
  'Para vincular esta cuenta, generá un código en la web (Conexiones) y mandámelo así:',
  '/vincular abc123def4',
].join('\n')

/**
 * Telegram webhook.
 *
 * Register it once (needs a public HTTPS URL):
 *   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *     -d url=https://<your-domain>/api/telegram/webhook \
 *     -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 *
 * Always answers 200: a non-200 makes Telegram retry the same update.
 */
export async function POST(request: Request) {
  const env = telegramEnv()
  if (!env) return NextResponse.json({ ok: true })

  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null
  const message = update?.message
  const text = message?.text?.trim()
  const chatId = message?.chat.id

  if (!text || !chatId || message?.from?.is_bot) {
    return NextResponse.json({ ok: true })
  }

  try {
    const supabase = createAdminClient()

    const linkMatch = /^\/vincular\s+([a-f0-9]{10})$/i.exec(text)
    if (linkMatch) {
      const { data: matched } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_link_code', linkMatch[1].toLowerCase())
        .maybeSingle()

      if (!matched) {
        await sendMessage(chatId, 'Ese código no es válido o ya se usó. Generá uno nuevo en la web.')
        return NextResponse.json({ ok: true })
      }

      // Single-use: the code is cleared as soon as it is redeemed.
      await supabase
        .from('users')
        .update({ telegram_chat_id: chatId, telegram_link_code: null })
        .eq('id', matched.id)

      await sendMessage(chatId, 'Listo, cuenta vinculada. Preguntame lo que quieras.')
      return NextResponse.json({ ok: true })
    }

    const { data: linked } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    if (!linked) {
      await sendMessage(chatId, HELP)
      return NextResponse.json({ ok: true })
    }

    if (text === '/start' || text === '/ayuda' || text === '/help') {
      await sendMessage(chatId, HELP)
      return NextResponse.json({ ok: true })
    }

    if (text === '/hoy') {
      await sendMessage(chatId, await buildDailyNudge(linked.id))
      return NextResponse.json({ ok: true })
    }

    const reply = await askCoach(linked.id, text, 'telegram')
    await sendMessage(chatId, reply)
  } catch (err) {
    console.error('Telegram webhook failed', err)
    await sendMessage(chatId, 'Se me cruzaron los cables. Probá de nuevo en un rato.').catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
