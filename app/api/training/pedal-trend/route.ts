import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasPedalData, type PedalMetrics } from '@/lib/garmin/pedal-metrics'
import { localDateKey } from '@/lib/training/dates'
import { buildPedalTrend } from '@/lib/training/pedal-trend'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = request.nextUrl.searchParams.get('days') ?? '180'
    const days = Math.min(Math.max(Number(raw) || 180, 14), 730)
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString()

    const { data: profile } = await supabase
      .from('users')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle()
    const timezone = profile?.timezone || 'UTC'

    const { data: rides, error } = await supabase
      .from('activities')
      .select('start_time, timezone, title, pedal_metrics')
      .eq('user_id', user.id)
      .not('pedal_metrics', 'is', null)
      .gte('start_time', cutoff)
      .order('start_time', { ascending: true })
      .limit(200)

    if (error) throw new Error(error.message)

    const trend = buildPedalTrend(
      (rides ?? []).flatMap((ride) => {
        const metrics = ride.pedal_metrics as PedalMetrics | null
        if (!metrics || !hasPedalData(metrics)) return []
        return [
          {
            date: localDateKey(ride.start_time, ride.timezone || timezone),
            title: ride.title,
            metrics,
          },
        ]
      })
    )

    return NextResponse.json(trend)
  } catch (error) {
    console.error('Pedal trend failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
