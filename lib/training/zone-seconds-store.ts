import { createAdminClient } from '@/lib/supabase/admin'
import { loadActivitySamples } from '@/lib/activities/samples'
import type { ZoneSecondsStatus } from '@/lib/types/database'
import { zoneSecondsFromSamples, type ZoneSeconds } from './polarization'

import 'server-only'

export type ZoneBackfillResult = {
  judged: number
  remaining: number
  blocked: 'no-anchor' | 'no-samples' | null
}

/**
 * Store time-in-zone on rides that have never been judged. Heart rate works
 * without FTP; power fills in the same pass the day FTP exists.
 */
export async function backfillZoneSeconds(userId: string, limit = 25): Promise<ZoneBackfillResult> {
  const supabase = createAdminClient()

  const { data: metrics, error: metricsError } = await supabase
    .from('athlete_metrics')
    .select('ftp, max_hr')
    .eq('user_id', userId)
    .maybeSingle()

  if (metricsError) throw new Error(`No se pudo leer tus umbrales: ${metricsError.message}`)

  const ftp = metrics?.ftp ?? null
  const maxHr = metrics?.max_hr ?? null
  if (!ftp && !maxHr) return { judged: 0, remaining: 0, blocked: 'no-anchor' }

  const { data: fresh, error: pendingError } = await supabase
    .from('activities')
    .select('id, avg_power, avg_hr, zone_seconds, zone_seconds_status')
    .eq('user_id', userId)
    .is('zone_seconds_status', null)
    .order('start_time', { ascending: false })
    .limit(limit)

  if (pendingError) throw new Error(`No se pudo leer las salidas: ${pendingError.message}`)

  let refill: typeof fresh = []
  if (ftp && (fresh?.length ?? 0) < limit) {
    const { data: withPower } = await supabase
      .from('activities')
      .select('id, avg_power, avg_hr, zone_seconds, zone_seconds_status')
      .eq('user_id', userId)
      .eq('zone_seconds_status', 'ok')
      .not('avg_power', 'is', null)
      .order('start_time', { ascending: false })
      .limit(limit)
    refill = (withPower ?? []).filter((row) => {
      const stored = row.zone_seconds as ZoneSeconds | null
      return stored != null && stored.power == null
    })
  }

  const seen = new Set<string>()
  const rows = [...(fresh ?? []), ...refill].filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  }).slice(0, limit)

  let judged = 0
  let missingSamples = 0

  for (const row of rows) {
    if (!row.avg_hr && !row.avg_power) {
      await write(supabase, row.id, { status: 'no_signal' })
      judged++
      continue
    }

    let samples
    try {
      samples = await loadActivitySamples(supabase, row.id)
    } catch {
      missingSamples++
      continue
    }
    if (!samples.length) {
      missingSamples++
      continue
    }

    const zones = zoneSecondsFromSamples({ samples, maxHr, ftp })
    const hasAny = Boolean(zones.hr || zones.power)
    await write(supabase, row.id, {
      status: hasAny ? 'ok' : 'no_signal',
      zones: hasAny ? zones : null,
    })
    judged++
  }

  const { count } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('zone_seconds_status', null)

  return {
    judged,
    remaining: count ?? 0,
    blocked: judged === 0 && missingSamples > 0 ? 'no-samples' : null,
  }
}

async function write(
  supabase: ReturnType<typeof createAdminClient>,
  activityId: string,
  value: { status: ZoneSecondsStatus; zones?: ZoneSeconds | null }
): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .update({
      zone_seconds_status: value.status,
      zone_seconds: value.zones ?? null,
    })
    .eq('id', activityId)

  if (error) throw new Error(`No se pudo guardar las zonas: ${error.message}`)
}
