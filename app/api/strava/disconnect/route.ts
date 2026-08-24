import { NextResponse } from 'next/server'
import { deauthorize } from '@/lib/strava/client'
import { getValidAccessToken, StravaNotConnectedError } from '@/lib/strava/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    await deauthorize(await getValidAccessToken(user.id))
  } catch (err) {
    // Revoking on Strava's side is best-effort; the local row must go regardless.
    if (!(err instanceof StravaNotConnectedError)) {
      console.error('Strava deauthorize failed', err)
    }
  }

  const { error } = await createAdminClient()
    .from('strava_connections')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'No se pudo desconectar.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
