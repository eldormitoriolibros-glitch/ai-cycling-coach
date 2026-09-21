import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { backfillZoneSeconds } from '@/lib/training/zone-seconds-store'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await backfillZoneSeconds(user.id, 25)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Polarization backfill failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
