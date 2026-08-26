import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/strava/tokens'
import { backfillActivitySamples } from '@/lib/strava/streams'

/**
 * POST /api/activities/sync-unsynced
 * Manually sync activities that don't have stream samples yet.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get access token for Strava
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(user.id)
    } catch (err) {
      return NextResponse.json(
        { error: 'No está conectado a Strava o el token expiró' },
        { status: 401 }
      )
    }

    // backfillActivitySamples already scopes to activities without samples yet.
    const samplesResult = await backfillActivitySamples(user.id, accessToken, 50)

    if (samplesResult.processed === 0) {
      return NextResponse.json({
        message: 'No hay actividades sin sincronizar',
        processed: 0,
      })
    }

    return NextResponse.json({
      message: `Sincronizadas ${samplesResult.processed} actividades`,
      processed: samplesResult.processed,
      remaining: samplesResult.remaining,
    })
  } catch (error) {
    console.error('Failed to sync unsynced activities:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}

