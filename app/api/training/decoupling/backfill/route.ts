import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { backfillDecoupling } from '@/lib/training/decoupling-store'

/**
 * POST /api/training/decoupling/backfill
 *
 * Judges a batch of past rides for Pw:Hr drift. Batched on purpose: reading
 * per-second samples is the expensive part, so the client calls this until
 * `remaining` hits zero instead of holding one long request open.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await backfillDecoupling(user.id, 25)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Decoupling backfill failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
