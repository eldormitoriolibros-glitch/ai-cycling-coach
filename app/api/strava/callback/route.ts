import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/crypto'
import { serverEnv } from '@/lib/env'
import { exchangeCodeForToken, STRAVA_SCOPES, STRAVA_STATE_COOKIE } from '@/lib/strava/client'
import { saveConnection } from '@/lib/strava/tokens'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function back(reason: string) {
  const siteUrl = serverEnv().NEXT_PUBLIC_SITE_URL
  return NextResponse.redirect(new URL(`/settings?strava=${reason}`, siteUrl).toString())
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cookieStore = cookies()
  const expectedState = cookieStore.get(STRAVA_STATE_COOKIE)?.value

  cookieStore.delete(STRAVA_STATE_COOKIE)

  if (searchParams.get('error')) return back('denied')

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return back('invalid_state')
  }

  // Strava lets the user untick scopes on the consent screen.
  const grantedScopes = searchParams.get('scope')?.split(',') ?? []
  if (!grantedScopes.includes('activity:read_all')) {
    return back('missing_scope')
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return back('not_authenticated')

  try {
    const token = await exchangeCodeForToken(code)
    await saveConnection(user.id, { ...token, scope: token.scope ?? STRAVA_SCOPES })
  } catch {
    return back('exchange_failed')
  }

  return back('connected')
}
