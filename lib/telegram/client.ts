import { telegramEnv } from '@/lib/env'

import 'server-only'

export function isTelegramConfigured(): boolean {
  return telegramEnv() !== null
}

export type TelegramUpdate = {
  message?: {
    text?: string
    chat: { id: number; type: string }
    from?: { id: number; is_bot: boolean; first_name?: string }
  }
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const env = telegramEnv()
  if (!env) throw new Error('Telegram no está configurado.')

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    // Telegram caps a single message at 4096 characters.
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
  })

  if (!response.ok) {
    throw new Error(`Telegram sendMessage falló (${response.status})`)
  }
}
