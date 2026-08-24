import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { isTelegramConfigured } from '@/lib/telegram/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Issues a single-use code the athlete sends to the bot to prove ownership. */
export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: 'Telegram no está configurado en el servidor.' }, { status: 503 })
  }

  const code = randomBytes(5).toString('hex')

  const { error } = await createAdminClient()
    .from('users')
    .update({ telegram_link_code: code, telegram_chat_id: null })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'No se pudo generar el código.' }, { status: 500 })
  }

  return NextResponse.json({ code })
}

export async function DELETE() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { error } = await createAdminClient()
    .from('users')
    .update({ telegram_chat_id: null, telegram_link_code: null })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'No se pudo desvincular.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
