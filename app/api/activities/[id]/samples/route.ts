import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { loadActivitySamples } from '@/lib/activities/samples'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: activity } = await supabase
      .from('activities')
      .select('user_id')
      .eq('id', params.id)
      .maybeSingle()

    if (!activity || activity.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const samples = await loadActivitySamples(supabase, params.id)
    return NextResponse.json(samples)
  } catch (error) {
    console.error('Failed to fetch activity samples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
