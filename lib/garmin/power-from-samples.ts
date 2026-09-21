import { createAdminClient } from '@/lib/supabase/admin'
import { derivePowerMetrics, wattsFromOffsets } from '@/lib/training/power-curve'

import 'server-only'

/**
 * Garmin FIT already stores per-second watts. The power page and TSS need the
 * same curve / NP that Strava streams used to compute. Fill those from samples
 * already in the DB so Connect-level power shows up without another download.
 */
export async function backfillGarminPowerFromSamples(
  userId: string,
  limit = 8
): Promise<number> {
  const supabase = createAdminClient()
  const { data: pending } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'garmin')
    .is('power_curve', null)
    .not('avg_power', 'is', null)
    .order('start_time', { ascending: false })
    .limit(limit)

  let updated = 0
  for (const row of pending ?? []) {
    const { data } = await supabase
      .from('activity_samples')
      .select('offset_seconds, power')
      .eq('activity_id', row.id)
      .order('offset_seconds', { ascending: true })
      .limit(20_000)

    const samples = (data ?? []) as Array<{ offset_seconds: number; power: number | null }>
    if (!samples.length) continue

    const derived = derivePowerMetrics(
      wattsFromOffsets(
        samples.map((sample) => ({ offsetSeconds: sample.offset_seconds, power: sample.power }))
      )
    )
    if (!derived.curve && derived.normalizedPower == null) continue

    const { error } = await supabase
      .from('activities')
      .update({
        power_curve: derived.curve,
        normalized_power: derived.normalizedPower,
        max_power: derived.maxPower,
        streams_status: derived.curve ? 'ok' : 'no_power',
        streams_fetched_at: new Date().toISOString(),
        has_power_meter: true,
      })
      .eq('id', row.id)

    if (!error) updated++
  }

  return updated
}
