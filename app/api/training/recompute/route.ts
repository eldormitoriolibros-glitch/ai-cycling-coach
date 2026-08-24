import { NextResponse } from 'next/server'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Re-derives training stress after FTP / heart-rate changes. */
export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    const updated = await recomputeActivityLoads(user.id)
    const series = await recomputeTrainingLoad(user.id)
    return NextResponse.json({ activitiesUpdated: updated, days: series.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo recalcular la carga.' },
      { status: 500 }
    )
  }
}
