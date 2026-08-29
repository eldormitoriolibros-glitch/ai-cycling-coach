import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '42', 10), 180)
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString()

  const [{ data: dailyLoads }, { data: activities }] = await Promise.all([
    supabase
      .from('training_load')
      .select('date, daily_load, acute_load, chronic_load, form, ramp_rate')
      .eq('user_id', user.id)
      .gte('date', cutoff.slice(0, 10))
      .order('date', { ascending: true }),
    supabase
      .from('activities')
      .select('id, start_time, training_load, sport_type, duration_seconds, moving_seconds, avg_hr, avg_power, title')
      .eq('user_id', user.id)
      .gte('start_time', cutoff)
      .order('start_time', { ascending: true }),
  ])

  // Build per-day activity load breakdown
  const dailyActivities: Record<string, { total: number; activities: any[] }> = {}
  for (const act of activities ?? []) {
    const date = act.start_time.slice(0, 10)
    if (!dailyActivities[date]) dailyActivities[date] = { total: 0, activities: [] }
    dailyActivities[date].total += act.training_load ?? 0
    dailyActivities[date].activities.push({
      id: act.id,
      title: act.title,
      load: act.training_load,
      sport: act.sport_type,
    })
  }

  // Compute 7-day rolling load for each day
  const loadTimeline = (dailyLoads ?? []).map((d) => ({
    date: d.date,
    dailyLoad: d.daily_load,
    acuteLoad: d.acute_load,
    chronicLoad: d.chronic_load,
    form: d.form,
    rampRate: d.ramp_rate,
  }))

  return NextResponse.json({
    loadTimeline,
    dailyActivities,
  })
}
