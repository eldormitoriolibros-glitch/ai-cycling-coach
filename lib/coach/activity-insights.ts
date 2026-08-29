import { createAdminClient } from '@/lib/supabase/admin'
import { countHrZones, countPowerZones, zoneCountsToPercent } from '@/lib/training/zones'

import 'server-only'

const PAGE_SIZE = 1000
// Allow the coach to inspect a longer window (default 30 days) so it can see full cycles.
const MAX_ACTIVITIES_ANALYZED = 200

type SampleRow = { heart_rate: number | null; power: number | null; temperature: number | null }

/** Paginated read — PostgREST caps a single response at ~1000 rows. */
async function fetchAllSamples(activityId: string): Promise<SampleRow[]> {
  const supabase = createAdminClient()
  const rows: SampleRow[] = []

  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from('activity_samples')
      .select('heart_rate, power, temperature')
      .eq('activity_id', activityId)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    rows.push(...((data as SampleRow[]) ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }

  return rows
}

/**
 * Compact per-activity breakdown (zone %, temperature range) for the most
 * recent rides that actually have per-second samples. This is what lets the
 * coach "see the charts" — it gets the same zone distribution shown on
 * /activities/[id], not just the plain averages.
 */
export async function buildRecentActivityInsights(
  userId: string,
  maxHr: number | null,
  ftp: number | null,
  daysBack = 30
): Promise<string> {
  const supabase = createAdminClient()

  // Only fetch activities within the requested window (daysBack) and cap the result.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysBack)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const { data: activities } = await supabase
    .from('activities')
    .select('id, start_time, title, sport_type, has_power_meter, avg_temperature, max_temperature, training_effect_aerobic, training_effect_anaerobic, avg_respiration_rate, calories, training_load, intensity_factor')
    .eq('user_id', userId)
    .gte('start_time', cutoffIso)
    .order('start_time', { ascending: false })
    .limit(MAX_ACTIVITIES_ANALYZED)

  if (!activities?.length) return ''

  const lines: string[] = []

  for (const activity of activities) {
    const samples = await fetchAllSamples(activity.id)
    if (!samples.length) continue

    const label = `${activity.start_time.slice(0, 10)} · ${activity.title ?? activity.sport_type ?? 'actividad'}`
    const parts: string[] = []

    const hrSamples = samples.map((s) => s.heart_rate)
    if (maxHr && hrSamples.some((v) => v !== null)) {
      const pct = zoneCountsToPercent(countHrZones(hrSamples, maxHr))
      parts.push(`pulso Z1-Z5 ${pct.Z1}/${pct.Z2}/${pct.Z3}/${pct.Z4}/${pct.Z5}%`)
    }

    if (activity.has_power_meter && ftp) {
      const powerSamples = samples.map((s) => s.power)
      if (powerSamples.some((v) => v !== null)) {
        const pct = zoneCountsToPercent(countPowerZones(powerSamples, ftp))
        parts.push(`potencia Z1-Z5+ ${pct.Z1}/${pct.Z2}/${pct.Z3}/${pct.Z4}/${pct['Z5+']}%`)
      }
    }

    const temps = samples.map((s) => s.temperature).filter((v): v is number => v !== null)
    if (temps.length) {
      parts.push(`temp. corporal ${Math.round(Math.min(...temps))}-${Math.round(Math.max(...temps))}°C`)
    }

    // Garmin-enriched session-level data
    const act = activity as any
    if (act.training_effect_aerobic != null) parts.push(`TE aeróbico ${act.training_effect_aerobic.toFixed(1)}`)
    if (act.training_effect_anaerobic != null) parts.push(`TE anaeróbico ${act.training_effect_anaerobic.toFixed(1)}`)
    if (act.avg_respiration_rate != null) parts.push(`respiración ${act.avg_respiration_rate.toFixed(0)} rpm`)
    if (act.calories != null) parts.push(`${Math.round(act.calories)} kcal`)
    if (act.training_load != null) parts.push(`carga ${Math.round(act.training_load)}`)

    if (parts.length) lines.push(`- ${label}: ${parts.join(', ')}`)
  }

  if (!lines.length) return ''

  return [
    '',
    '## Distribución de zonas por actividad (datos reales segundo a segundo, no estimados)',
    ...lines,
  ].join('\n')
}
