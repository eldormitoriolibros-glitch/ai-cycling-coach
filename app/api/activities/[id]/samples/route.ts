import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/activities/[id]/samples
 * Returns second-by-second activity data for charting (HR, power, cadence, speed, elevation)
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // PostgREST caps a single response at ~1000 rows by default; a long ride can have
    // many more samples than that, so page through until a page comes back short.
    const PAGE_SIZE = 1000
    const samples: Array<Record<string, unknown>> = []
    for (let page = 0; ; page++) {
      const { data: chunk, error: samplesError } = await supabase
        .from('activity_samples')
        .select('offset_seconds, heart_rate, power, cadence, speed, elevation, temperature, latitude, longitude')
        .eq('activity_id', params.id)
        .order('offset_seconds', { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (samplesError) {
        console.error('Failed to query activity_samples:', samplesError.message)
        return NextResponse.json({ error: 'No se pudieron leer las muestras.' }, { status: 500 })
      }

      samples.push(...(chunk ?? []))
      if (!chunk || chunk.length < PAGE_SIZE) break
    }

    // Verify user owns this activity
    const { data: activity } = await supabase
      .from('activities')
      .select('user_id')
      .eq('id', params.id)
      .maybeSingle()

    if (!activity || activity.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(samples)
  } catch (error) {
    console.error('Failed to fetch activity samples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
