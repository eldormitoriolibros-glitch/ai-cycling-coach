import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`)
}

function padRangeToWeeks(start: Date, end: Date) {
  const startPadding = new Date(start)
  const dayOfWeek = startPadding.getDay()
  startPadding.setDate(startPadding.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  startPadding.setHours(0, 0, 0, 0)

  const endPadding = new Date(end)
  const endDow = endPadding.getDay()
  endPadding.setDate(endPadding.getDate() + (endDow === 0 ? 0 : 7 - endDow))
  endPadding.setHours(23, 59, 59, 999)

  return { startPadding, endPadding }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json([], { status: 401 })

  const url = new URL(request.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  let startPadding: Date
  let endPadding: Date

  if (fromParam && toParam) {
    ;({ startPadding, endPadding } = padRangeToWeeks(parseLocalDate(fromParam), parseLocalDate(toParam)))
  } else {
    const year = parseInt(url.searchParams.get('year') ?? new Date().getFullYear().toString(), 10)
    const month = parseInt(url.searchParams.get('month') ?? (new Date().getMonth() + 1).toString(), 10)
    const first = new Date(year, month - 1, 1)
    const last = new Date(year, month, 0)
    ;({ startPadding, endPadding } = padRangeToWeeks(first, last))
  }

  const { data: activities } = await supabase
    .from('activities')
    .select('id, title, start_time, distance_meters, moving_seconds, duration_seconds, avg_hr, avg_power, training_load, sport_type, activity_type, elevation_gain_meters')
    .eq('user_id', user.id)
    .gte('start_time', startPadding.toISOString())
    .lte('start_time', endPadding.toISOString())
    .order('start_time', { ascending: true })

  return NextResponse.json(activities ?? [])
}
