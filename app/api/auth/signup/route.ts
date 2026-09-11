import { NextResponse } from 'next/server'
import { z } from 'zod'
import { safeEqual } from '@/lib/crypto'
import { inviteEnv } from '@/lib/env'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional(),
  inviteCode: z.string().min(1),
})

const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

/**
 * Invite-only registration. Only reachable when `SIGNUP_INVITE_CODE` is set;
 * the login page falls back to Supabase's own signup otherwise. Accounts are
 * created already confirmed, so the athlete can sign in straight away.
 */
export async function POST(request: Request) {
  const invite = inviteEnv()
  if (!invite) {
    return NextResponse.json({ error: 'El registro por invitación no está configurado.' }, { status: 503 })
  }

  const limit = rateLimit(`signup:${clientIp(request)}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Probá de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  }

  if (!safeEqual(parsed.data.inviteCode, invite.SIGNUP_INVITE_CODE)) {
    return NextResponse.json({ error: 'El código de invitación no es válido.' }, { status: 403 })
  }

  const { error } = await createAdminClient().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { name: parsed.data.name ?? '' },
  })

  if (error) {
    // Never echo the provider message: it distinguishes "already registered".
    return NextResponse.json({ error: 'No se pudo crear la cuenta.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
