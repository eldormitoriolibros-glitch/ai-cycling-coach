import { readdir, readFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractFitReport } from './archive'
import { parseFitFile, buildFitImportRows, type ParsedFitActivity } from './fit'
import { enrichActivities } from './fit-enrich'

import 'server-only'

export type IngestTotals = {
  enriched: number
  created: number
  samplesAdded: number
  samplesReplaced: number
}

export type AthleteThresholds = {
  ftp: number | null
  maxHr: number | null
  restingHr: number | null
  timeZone: string
}

/** Garmin's list endpoint exposes the id under a couple of different keys. */
export function garminActivityId(activity: any): string | null {
  const id = activity?.activityId ?? activity?.activityid ?? activity?.id
  return id == null ? null : String(id)
}

/**
 * Downloads one activity's original upload from Garmin and returns every FIT
 * session inside it. Garmin hands back a zip that can hold auxiliary
 * METRICS/WELLNESS files alongside the ride, so extraction goes through the
 * shared archive walker rather than a top-level filename scan.
 */
export async function downloadActivityFits(
  client: any,
  activity: any
): Promise<ParsedFitActivity[]> {
  const dir = join(tmpdir(), `garmin-act-${randomUUID()}`)
  const out: ParsedFitActivity[] = []

  try {
    await mkdir(dir, { recursive: true })
    await client.downloadOriginalActivityData(activity, dir, 'zip')

    for (const file of await readdir(dir)) {
      const buf = await readFile(join(dir, file))
      const { fits } = await extractFitReport(buf, file)
      for (const fit of fits) {
        const sessions = await parseFitFile(fit.data).catch(() => [])
        out.push(...sessions)
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }

  const id = garminActivityId(activity)
  return out.map((session) => ({ ...session, garminActivityId: id }))
}

/**
 * Enriches matching activities with FIT data and creates rows for the rest.
 * Shared by the incremental sync and the historical backfill so both behave
 * identically.
 */
export async function ingestFitActivities(
  userId: string,
  fitActivities: ParsedFitActivity[],
  thresholds: AthleteThresholds
): Promise<IngestTotals> {
  const totals: IngestTotals = { enriched: 0, created: 0, samplesAdded: 0, samplesReplaced: 0 }
  if (fitActivities.length === 0) return totals

  const supabase = createAdminClient()
  const { ftp, maxHr, restingHr, timeZone } = thresholds

  const enrichResult = await enrichActivities(userId, fitActivities, ftp, maxHr, restingHr)
  totals.enriched = enrichResult.enriched
  totals.samplesAdded = enrichResult.samplesAdded
  totals.samplesReplaced = enrichResult.samplesReplaced

  if (enrichResult.unmatched.length === 0) return totals

  const items = await buildFitImportRows(
    userId,
    enrichResult.unmatched,
    timeZone,
    ftp,
    maxHr,
    restingHr
  )
  if (items.length === 0) return totals

  const { data: upserted, error } = await supabase
    .from('activities')
    .upsert(
      items.map((item) => item.row),
      { onConflict: 'user_id,source,external_id' }
    )
    .select('id, external_id')

  if (error) throw new Error(error.message)

  for (const dbRow of upserted ?? []) {
    const match = items.find((item) => item.externalId === dbRow.external_id)
    if (!match || match.records.length === 0) continue

    const sampleRows = match.records.map((r) => ({
      user_id: userId,
      activity_id: dbRow.id,
      offset_seconds: r.offsetSeconds,
      heart_rate: r.heartRate,
      power: r.power,
      cadence: r.cadence,
      speed: r.speed,
      elevation: r.elevation,
      temperature: r.temperature,
      respiration_rate: r.respirationRate,
      latitude: r.latitude,
      longitude: r.longitude,
    }))

    await supabase.from('activity_samples').delete().eq('activity_id', dbRow.id)
    for (let i = 0; i < sampleRows.length; i += 1000) {
      await supabase
        .from('activity_samples')
        .upsert(sampleRows.slice(i, i + 1000) as any, { onConflict: 'activity_id,offset_seconds' })
    }
  }

  totals.created = items.length
  return totals
}

/** Reads the profile values the load estimator needs. */
export async function loadThresholds(userId: string): Promise<AthleteThresholds> {
  const supabase = createAdminClient()
  const [{ data: profile }, { data: metrics }] = await Promise.all([
    supabase.from('users').select('timezone').eq('id', userId).maybeSingle(),
    supabase.from('athlete_metrics').select('ftp, max_hr, resting_hr').eq('user_id', userId).maybeSingle(),
  ])

  return {
    ftp: metrics?.ftp ?? null,
    maxHr: metrics?.max_hr ?? null,
    restingHr: metrics?.resting_hr ?? null,
    timeZone: profile?.timezone || 'UTC',
  }
}
