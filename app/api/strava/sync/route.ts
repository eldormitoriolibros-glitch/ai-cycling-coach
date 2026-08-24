import { NextResponse } from 'next/server'
import { z } from 'zod'
import { syncActivities } from '@/lib/strava/sync'
import { StravaNotConnectedError } from '@/lib/strava/tokens'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({ full: z.boolean().optional() })

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = bodySchema.safeParse(await request.json().catch(() => ({})))
  const full = body.success ? (body.data.full ?? false) : false

  try {
    const result = await syncActivities(user.id, 'manual', { full })

    if (result.status === 'error') {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    return NextResponse.json({
      synced: result.synced,
      status: result.status,
      streamsProcessed: result.streamsProcessed,
      streamsRemaining: result.streamsRemaining,
    })
  } catch (err) {
    if (err instanceof StravaNotConnectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo sincronizar.' }, { status: 500 })
  }
}
