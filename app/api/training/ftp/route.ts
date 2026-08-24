import { NextResponse } from 'next/server'
import { z } from 'zod'
import { applyEstimatedFtp, loadPowerSummary } from '@/lib/training/ftp'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({ ftp: z.number().int().min(50).max(700) })

/** Adopts an estimated FTP and re-derives every training-stress value with it. */
export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'FTP inválido.' }, { status: 400 })
  }

  // Re-check server-side: never trust an FTP the client made up.
  const summary = await loadPowerSummary(user.id)
  if (!summary.estimate || summary.estimate.ftp !== parsed.data.ftp) {
    return NextResponse.json(
      { error: 'La estimación cambió. Recargá la página y probá de nuevo.' },
      { status: 409 }
    )
  }

  try {
    await applyEstimatedFtp(user.id, summary.estimate.ftp)
    const updated = await recomputeActivityLoads(user.id)
    await recomputeTrainingLoad(user.id)

    return NextResponse.json({ ftp: summary.estimate.ftp, activitiesUpdated: updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo aplicar el FTP.' },
      { status: 500 }
    )
  }
}
