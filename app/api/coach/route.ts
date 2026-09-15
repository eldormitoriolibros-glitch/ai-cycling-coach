import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AiNotConfiguredError } from '@/lib/ai/gemini'
import { askCoach } from '@/lib/coach'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const bodySchema = z
  .object({
    message: z.string().trim().max(2000).optional(),
    start: z.literal('propose').optional(),
  })
  .refine((data) => data.start === 'propose' || (data.message && data.message.length >= 1), {
    message: 'Mensaje inválido.',
  })

/** The Gemini quota is shared by every athlete, so one chat cannot hog it. */
const COACH_LIMIT = 20
const COACH_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const limit = rateLimit(`coach:${user.id}`, COACH_LIMIT, COACH_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Estás yendo muy rápido. Esperá unos minutos y volvé a escribirle.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensaje inválido.' }, { status: 400 })
  }

  try {
    const reply = await askCoach(user.id, parsed.data.message ?? '', 'web', {
      start: parsed.data.start,
    })
    return NextResponse.json({ reply })
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'El entrenador no pudo responder.' },
      { status: 502 }
    )
  }
}
