import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPowerSummary, type CurvePoint } from '@/lib/training/ftp'

/** Save a weekly snapshot of the power curve (90-day window) if not present. */
export async function maybeSaveSnapshot(userId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  const snapshotDate = monday.toISOString().slice(0, 10)

  const { data: existing } = await supabase
    .from('power_curve_snapshots')
    .select('id')
    .eq('user_id', userId)
    .eq('snapshot_date', snapshotDate)
    .maybeSingle()

  if (existing) return false

  const summary = await loadPowerSummary(userId)
  if (!summary?.curve?.length) return false

  // supabase client typing for dynamic tables can be strict; cast to any to avoid type errors
  const { error } = await supabase.from('power_curve_snapshots').insert({
    user_id: userId,
    snapshot_date: snapshotDate,
    window_days: 90,
    curve: summary.curve,
  } as any)

  if (error) {
    console.error('Failed to save power curve snapshot:', error.message)
    return false
  }

  return true
}

/** Load the most recent snapshot older than `beforeDate` (default: 90 days ago). */
export async function loadPreviousSnapshot(
  userId: string,
  beforeDate?: string
): Promise<CurvePoint[] | null> {
  const supabase = createAdminClient()
  const cutoff = beforeDate ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)

  const { data } = await supabase
    .from('power_curve_snapshots')
    .select('curve')
    .eq('user_id', userId)
    .lt('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  // `data` has dynamic typing from supabase client; coerce to expected shape
  const anyData = data as any
  return (anyData?.curve as CurvePoint[]) ?? null
}

