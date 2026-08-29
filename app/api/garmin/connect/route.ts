import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loginWithCredentials } from '@/lib/garmin/client'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { email, password } = parsed.data
  const result = await loginWithCredentials(email, password)

  if (!result.ok) {
    if (result.needsMfa) {
      return NextResponse.json({ needsMfa: true })
    }
    return NextResponse.json({ error: result.error ?? 'Error al conectar con Garmin' }, { status: 400 })
  }

  const admin = createAdminClient()
  await admin.from('garmin_connections').upsert(
    {
      user_id: user.id,
      garmin_email: result.email,
      tokens_encrypted: result.tokensEncrypted,
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: 'user_id' }
  )

  return NextResponse.json({ connected: true, email: result.email })
}
