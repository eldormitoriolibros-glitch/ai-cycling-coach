import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authorizeUrl, isStravaConfigured, STRAVA_STATE_COOKIE } from '@/lib/strava/client'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  if (!isStravaConfigured()) {
    return NextResponse.json({ error: 'Strava no está configurado en este servidor.' }, { status: 503 })
  }

  // CSRF guard: the state is echoed back by Strava and compared to this cookie.
  const state = randomBytes(32).toString('base64url')

  cookies().set(STRAVA_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  return NextResponse.redirect(authorizeUrl(state))
}
