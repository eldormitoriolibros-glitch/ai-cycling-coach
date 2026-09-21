import { createAdminClient } from '@/lib/supabase/admin'
import { getGarminClient } from './client'
import { downloadActivityFits, garminActivityId } from './activity-sync'
import { hasPedalData, pedalFromGarminList, type PedalMetrics } from './pedal-metrics'

import 'server-only'

export type PedalBackfillResult = {
  scanned: number
  updated: number
  fromList: number
  fromFit: number
  failures: number
  error?: string
}

function pedalComplete(metrics: PedalMetrics | null): boolean {
  if (!metrics) return false
  return (
    metrics.leftPct != null &&
    (metrics.leftTe != null || metrics.rightTe != null) &&
    (metrics.leftSmooth != null || metrics.rightSmooth != null)
  )
}

/**
 * Recovers L/R balance, torque effectiveness, smoothness and phase for the
 * latest power-meter rides. List fields first; FIT if the list is thin.
 */
export async function backfillRecentPedalMetrics(
  userId: string,
  options?: { limit?: number; client?: any; listed?: any[] }
): Promise<PedalBackfillResult> {
  const result: PedalBackfillResult = {
    scanned: 0,
    updated: 0,
    fromList: 0,
    fromFit: 0,
    failures: 0,
  }

  const supabase = createAdminClient()
  const { data: rides } = await supabase
    .from('activities')
    .select('id, external_id, title, start_time, pedal_metrics')
    .eq('user_id', userId)
    .eq('source', 'garmin')
    .eq('has_power_meter', true)
    .order('start_time', { ascending: false })
    .limit(options?.limit ?? 3)

  const pending = (rides ?? []).filter((row) => !hasPedalData(row.pedal_metrics as PedalMetrics | null))
  result.scanned = pending.length
  if (pending.length === 0) return result

  let client = options?.client
  let saveTokens: (() => Promise<void>) | undefined

  if (!client) {
    const garmin = await getGarminClient(userId)
    if (!garmin) return { ...result, error: 'No hay conexión con Garmin.' }
    client = garmin.client
    saveTokens = garmin.saveTokens
  }
  const listed: any[] = options?.listed ?? (await client.getActivities(0, 30)) ?? []

  const byId = new Map<string, any>()
  for (const activity of listed) {
    const id = garminActivityId(activity)
    if (id) byId.set(id, activity)
  }

  for (const ride of pending) {
    const garminId = ride.external_id?.startsWith('garmin-')
      ? ride.external_id.slice('garmin-'.length)
      : null
    const listedRow = garminId ? byId.get(garminId) : null
    if (!listedRow) continue

    let metrics = pedalFromGarminList(listedRow)
    let source: 'list' | 'fit' = 'list'

    if (!pedalComplete(metrics)) {
      try {
        const fits = await downloadActivityFits(client, listedRow)
        const fromFit = fits.map((fit) => fit.pedalMetrics).find(hasPedalData) ?? null
        if (hasPedalData(fromFit)) {
          metrics = fromFit
          source = 'fit'
        }
      } catch {
        result.failures++
      }
    }

    if (!hasPedalData(metrics)) continue

    const { error } = await supabase
      .from('activities')
      .update({ pedal_metrics: metrics })
      .eq('id', ride.id)
    if (error) {
      result.failures++
      continue
    }
    result.updated++
    if (source === 'fit') result.fromFit++
    else result.fromList++
  }

  if (saveTokens) await saveTokens().catch(() => {})
  return result
}
