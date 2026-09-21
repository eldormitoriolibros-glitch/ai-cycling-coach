import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { localDateKey } from '@/lib/training/dates'
import {
  polarizationVerdict,
  rollupPolarizationWeeks,
  sharesOf,
  addBands,
  emptyBand,
  type ZoneSeconds,
} from '@/lib/training/polarization'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = request.nextUrl.searchParams.get('days') ?? '112'
    const parsed = Number(raw)
    const unbounded = raw === 'all' || parsed === 0
    const days = unbounded ? null : Math.min(Math.max(Number.isFinite(parsed) ? parsed : 112, 14), 1200)
    const cutoff = days == null ? null : new Date(Date.now() - days * 86400_000).toISOString()

    let rideQuery = supabase
      .from('activities')
      .select('start_time, timezone, zone_seconds')
      .eq('user_id', user.id)
      .eq('zone_seconds_status', 'ok')
      .order('start_time', { ascending: true })
    if (cutoff) rideQuery = rideQuery.gte('start_time', cutoff)

    const [{ data: profile }, { data: metrics }, { data: rides, error }] = await Promise.all([
      supabase.from('users').select('timezone').eq('id', user.id).maybeSingle(),
      supabase.from('athlete_metrics').select('ftp').eq('user_id', user.id).maybeSingle(),
      rideQuery,
    ])

    if (error) throw new Error(error.message)

    const timezone = profile?.timezone || 'UTC'
    const weeks = rollupPolarizationWeeks(
      (rides ?? []).flatMap((ride) => {
        const zones = ride.zone_seconds as ZoneSeconds | null
        if (!zones) return []
        return [
          {
            date: localDateKey(ride.start_time, ride.timezone || timezone),
            zones,
          },
        ]
      }),
      Boolean(metrics?.ftp)
    )

    const recent = weeks.slice(-4)
    const combined = recent.reduce((acc, week) => addBands(acc, week.band), emptyBand())
    const shares = sharesOf(combined)

    return NextResponse.json({
      weeks,
      verdict: shares ? polarizationVerdict(shares) : null,
      shares,
      usedFtp: Boolean(metrics?.ftp),
    })
  } catch (error) {
    console.error('Polarization read failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
