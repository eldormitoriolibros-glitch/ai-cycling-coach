import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ identifier: z.string() })

/** This endpoint maps a username to an email, so it is worth enumerating. */
const RESOLVE_LIMIT = 10
const RESOLVE_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: Request) {
  const limit = rateLimit(`resolve:${clientIp(request)}`, RESOLVE_LIMIT, RESOLVE_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const body = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const identifier = body.data.identifier.trim()
  if (!identifier) return NextResponse.json({ error: 'Empty identifier' }, { status: 400 })

  try {
    const admin = createAdminClient()
    // prefer exact username match on public.users.username
    // Cast the column name to any to satisfy the typed client when schema types
    // may be out of sync (username column added via migration).
    let { data, error } = await admin.from('users').select('email').eq('username' as any, identifier).maybeSingle()
    if (error) {
      // fall back to matching email local-part if username column missing or error
      const pattern = `${identifier}@%`
      const res = await admin.from('users').select('email').ilike('email', pattern).limit(1).maybeSingle()
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
      if (!res.data || !res.data.email) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ email: res.data.email })
    }

    if (!data || !data.email) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ email: data.email })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

