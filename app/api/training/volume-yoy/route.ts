import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { localDateKey } from '@/lib/training/dates'
import { rollupYearVolume } from '@/lib/training/volume-yoy'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle()

    const timezone = profile?.timezone || 'UTC'
    const year = Number(localDateKey(new Date(), timezone).slice(0, 4))
    const from = `${year - 1}-01-01`

    const { data: rides, error } = await supabase
      .from('activities')
      .select('start_time, timezone, moving_seconds, duration_seconds')
      .eq('user_id', user.id)
      .gte('start_time', from)
      .order('start_time', { ascending: true })

    if (error) throw new Error(error.message)

    const volume = rollupYearVolume({
      year,
      rides: (rides ?? []).map((ride) => ({
        date: localDateKey(ride.start_time, ride.timezone || timezone),
        seconds: ride.moving_seconds ?? ride.duration_seconds ?? 0,
      })),
    })

    return NextResponse.json(volume)
  } catch (error) {
    console.error('Volume YoY failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
