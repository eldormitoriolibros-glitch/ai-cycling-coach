import { createAdminClient } from '@/lib/supabase/admin'
import { loadActivitySamples } from '@/lib/activities/samples'
import type { DecouplingStatus } from '@/lib/types/database'
import { computeDecoupling, type DecouplingSample, type DecouplingSkip } from './decoupling'

import 'server-only'

/** Warmup (10 min) plus the shortest window worth judging (40 min). */
const MIN_RIDE_SECONDS = 50 * 60

/** Keyed by the skip union, so a new reason cannot be silently mis-stored. */
const SKIP_TO_STATUS: Record<DecouplingSkip, DecouplingStatus> = {
  'no-power': 'no_power',
  'too-short': 'too_short',
  'too-hard': 'too_hard',
}

export type BackfillResult = {
  judged: number
  remaining: number
  /** Why nothing moved, when nothing moved. */
  blocked: 'no-ftp' | 'no-samples' | null
}

/**
 * Compute Pw:Hr drift for rides that have never been judged, so the trend on
 * the power page has history behind it.
 *
 * Every ride gets a status, including the ones that cannot produce a number.
 * Without that, each run would page through the samples of every short or hard
 * ride again and find nothing — so the same rides are only ever read once.
 */
export async function backfillDecoupling(userId: string, limit = 25): Promise<BackfillResult> {
  const supabase = createAdminClient()

  const { data: metrics, error: metricsError } = await supabase
    .from('athlete_metrics')
    .select('ftp')
    .eq('user_id', userId)
    .maybeSingle()

  if (metricsError) throw new Error(`No se pudo leer tu FTP: ${metricsError.message}`)

  const ftp = metrics?.ftp ?? null
  if (!ftp) return { judged: 0, remaining: 0, blocked: 'no-ftp' }

  const { data: pending, error: pendingError } = await supabase
    .from('activities')
    .select('id, moving_seconds, duration_seconds, avg_power, avg_hr')
    .eq('user_id', userId)
    .is('decoupling_status', null)
    .order('start_time', { ascending: false })
    .limit(limit)

  // Almost always the migration not having been run yet.
  if (pendingError) throw new Error(`No se pudo leer las salidas: ${pendingError.message}`)

  let judged = 0
  // Rides that should qualify but have no second-by-second data stored yet.
  let missingSamples = 0

  for (const row of pending ?? []) {
    const seconds = row.moving_seconds ?? row.duration_seconds ?? 0

    // Metadata alone rules these out, so never touch the sample rows.
    let status: DecouplingStatus | null = null
    if (!row.avg_power || !row.avg_hr) status = 'no_power'
    else if (seconds < MIN_RIDE_SECONDS) status = 'too_short'

    if (status) {
      await write(supabase, row.id, { status })
      judged++
      continue
    }

    let samples: DecouplingSample[]
    try {
      samples = await loadActivitySamples(supabase, row.id)
    } catch {
      missingSamples++
      continue // Leave the status null so a later run retries.
    }
    if (!samples.length) {
      missingSamples++
      continue
    }

    const outcome = computeDecoupling({ samples, ftp })

    if ('skip' in outcome) {
      await write(supabase, row.id, { status: SKIP_TO_STATUS[outcome.skip] })
    } else {
      await write(supabase, row.id, {
        status: 'ok',
        percent: outcome.result.percent,
        seconds: outcome.result.analyzedSeconds,
      })
    }
    judged++
  }

  const { count } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('decoupling_status', null)

  return {
    judged,
    remaining: count ?? 0,
    blocked: judged === 0 && missingSamples > 0 ? 'no-samples' : null,
  }
}

async function write(
  supabase: ReturnType<typeof createAdminClient>,
  activityId: string,
  value: { status: DecouplingStatus; percent?: number; seconds?: number }
): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .update({
      decoupling_status: value.status,
      decoupling_percent: value.percent ?? null,
      decoupling_seconds: value.seconds ?? null,
    })
    .eq('id', activityId)

  // Surfaced rather than swallowed: a missing migration would otherwise look
  // like a button that runs and quietly achieves nothing.
  if (error) throw new Error(`No se pudo guardar el desacople: ${error.message}`)
}
