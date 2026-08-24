import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AiNotConfiguredError } from '@/lib/ai/gemini'
import { askCoach } from '@/lib/coach'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({ message: z.string().trim().min(1).max(2000) })

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensaje inválido.' }, { status: 400 })
  }

  try {
    const reply = await askCoach(user.id, parsed.data.message, 'web')
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
