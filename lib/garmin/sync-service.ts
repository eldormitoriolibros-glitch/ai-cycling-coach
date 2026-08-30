import { createAdminClient } from '@/lib/supabase/admin'
import { getGarminClient } from './client'
import {
  downloadActivityFits,
  garminActivityId,
  ingestFitActivities,
  loadExistingGarminRows,
  loadThresholds,
  upsertGarminListActivities,
} from './activity-sync'
import type { ParsedFitActivity } from './fit'
import { findMatch, type ExistingActivity } from './activity-match'
import { listActivityToParsedFit, parseGarminListStart } from './list-import'
import { removeDuplicateActivities } from '@/lib/training/dedupe'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'

import 'server-only'

export type SyncPreviewItem = {
  id: string
  title: string
  startTime: string | null
}

export type SyncResult = {
  activitiesEnriched: number
  activitiesCreated: number
  activitiesFromList: number
  activitiesPending: number
  samplesAdded: number
  healthDaysUpdated: number
  fitDownloadFailures: number
  duplicatesRemoved: number
  latestFromGarmin: SyncPreviewItem[]
  error?: string
}

export async function syncGarminData(userId: string): Promise<SyncResult> {
  const supabase = createAdminClient()
  const result: SyncResult = {
    activitiesEnriched: 0,
    activitiesCreated: 0,
    activitiesFromList: 0,
    activitiesPending: 0,
    samplesAdded: 0,
    healthDaysUpdated: 0,
    fitDownloadFailures: 0,
    duplicatesRemoved: 0,
    latestFromGarmin: [],
  }

  const garmin = await getGarminClient(userId)
  if (!garmin) return { ...result, error: 'No Garmin connection found' }

  const { client, saveTokens } = garmin

  const thresholds = await loadThresholds(userId)

  // --- Activities sync ---
  try {
    const activities = await client.getActivities(0, 50)
    const listed = activities ?? []
    result.latestFromGarmin = listed.slice(0, 5).map((a: any) => ({
      id: garminActivityId(a) ?? '?',
      title: a.activityName ?? a.activityType?.typeKey ?? 'actividad',
      startTime: parseGarminListStart(a)?.toISOString() ?? null,
    }))

    const candidateIds = listed
      .map((a: any) => garminActivityId(a))
      .filter((id): id is string => id != null)
    const existingRows = await loadExistingGarminRows(userId, candidateIds)
    const cutoff = new Date(Date.now() - 21 * 86_400_000)
    const recentExisting = await loadRecentActivityMatches(userId, cutoff)
    const taken = new Set<string>()

    const toCreate: ParsedFitActivity[] = []
    const toDownload: any[] = []

    for (const activity of listed) {
      const start = parseGarminListStart(activity)
      if (start && start < cutoff) continue
      const id = garminActivityId(activity)
      if (!id) continue

      const stored = existingRows.get(id)
      if (stored) {
        if (!start) continue
        const delta = Math.abs(new Date(stored.start_time).getTime() - start.getTime())
        if (delta <= 12 * 3_600_000) continue
      }

      const parsed = listActivityToParsedFit(activity)
      if (!parsed) continue

      const match = findMatch(parsed, recentExisting, taken)
      if (match) {
        taken.add(match.activity.id)
        continue
      }

      toCreate.push(parsed)
      toDownload.push(activity)
    }
    result.activitiesPending = toCreate.length

    if (toCreate.length > 0) {
      const listTotals = await upsertGarminListActivities(userId, toCreate, thresholds)
      result.activitiesCreated += listTotals.created
      result.activitiesFromList += listTotals.created
      result.activitiesEnriched += listTotals.enriched
    }

    const fitActivities: ParsedFitActivity[] = []
    for (const activity of toDownload) {
      try {
        const fits = await downloadActivityFits(client, activity)
        if (fits.length > 0) fitActivities.push(...fits)
        else result.fitDownloadFailures++
      } catch (err) {
        console.error(`Garmin sync: failed to download activity ${garminActivityId(activity)}:`, err)
        result.fitDownloadFailures++
      }
    }

    if (fitActivities.length > 0) {
      const totals = await ingestFitActivities(userId, fitActivities, thresholds)
      result.activitiesEnriched += totals.enriched
      result.samplesAdded += totals.samplesAdded + totals.samplesReplaced
    }

    result.duplicatesRemoved = await removeDuplicateActivities(userId)
  } catch (err) {
    console.error('Garmin activity sync failed:', err)
  }

  // --- Health sync (last 7 days) ---
  try {
    const today = new Date()
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)
      const dateStr = date.toISOString().slice(0, 10)

      const healthPatch: Record<string, any> = { source: 'garmin' }
      let hasData = false

      // Heart rate data (resting HR)
      try {
        const hr = await client.getHeartRate(date)
        if (hr) {
          const restHr = (hr as any).restingHeartRate ?? (hr as any).minHeartRate
          if (restHr != null) { healthPatch.resting_hr = restHr; hasData = true }
        }
      } catch { /* endpoint not available */ }

      // Sleep data
      try {
        const sleep = await client.getSleepData(date)
        if (sleep) {
          const s = sleep as any
          const durationMinutes = s.sleepTimeSeconds ? Math.round(s.sleepTimeSeconds / 60) : null
          const sleepScore = s.overallScore ?? s.sleepScores?.overall ?? null
          const deepMinutes = s.deepSleepSeconds ? Math.round(s.deepSleepSeconds / 60) : null
          const remMinutes = s.remSleepSeconds ? Math.round(s.remSleepSeconds / 60) : null
          const awakeMinutes = s.awakeSleepSeconds ? Math.round(s.awakeSleepSeconds / 60) : null

          if (durationMinutes != null) {
            await supabase.from('sleep').upsert({
              user_id: userId,
              date: dateStr,
              source: 'garmin',
              duration_minutes: durationMinutes,
              sleep_score: sleepScore,
              deep_sleep_minutes: deepMinutes,
              rem_sleep_minutes: remMinutes,
              awake_minutes: awakeMinutes,
            } as any, { onConflict: 'user_id,date' })
          }
        }
      } catch { /* sleep data not available */ }

      // Use generic GET for daily summary (stress, Body Battery, SpO2)
      try {
        const summary = await client.get<any>(
          `https://connect.garmin.com/usersummary-service/usersummary/daily/${dateStr}`
        )
        if (summary) {
          if (summary.averageStressLevel != null) { healthPatch.stress = Math.round(summary.averageStressLevel); hasData = true }
          if (summary.bodyBatteryHighestValue != null) { healthPatch.body_battery_high = summary.bodyBatteryHighestValue; hasData = true }
          if (summary.bodyBatteryLowestValue != null) { healthPatch.body_battery_low = summary.bodyBatteryLowestValue; hasData = true }
          if (summary.averageSpo2 != null) { healthPatch.spo2_avg = summary.averageSpo2; hasData = true }
        }
      } catch { /* daily summary not available */ }

      if (hasData) {
        const { data: existing } = await supabase
          .from('recovery_metrics')
          .select('id, source, resting_hr, hrv, stress, body_battery_high, body_battery_low, spo2_avg')
          .eq('user_id', userId)
          .eq('date', dateStr)
          .maybeSingle()

        if (existing) {
          const updatePatch: Record<string, any> = {}
          for (const [key, val] of Object.entries(healthPatch)) {
            if (key === 'source') continue
            if ((existing as any)[key] == null && val != null) {
              updatePatch[key] = val
            }
          }
          if (existing.source === 'manual' || existing.source == null) {
            updatePatch.source = 'garmin'
          }
          if (Object.keys(updatePatch).length > 0) {
            await supabase.from('recovery_metrics').update(updatePatch as any).eq('id', existing.id)
            result.healthDaysUpdated++
          }
        } else {
          await supabase.from('recovery_metrics').insert({
            user_id: userId,
            date: dateStr,
            ...healthPatch,
          } as any)
          result.healthDaysUpdated++
        }
      }
    }
  } catch (err) {
    console.error('Garmin health sync failed:', err)
  }

  // Recompute loads if activities were touched
  if (result.activitiesEnriched + result.activitiesCreated + result.duplicatesRemoved > 0) {
    try {
      await recomputeActivityLoads(userId)
      await recomputeTrainingLoad(userId)
    } catch (err) {
      console.error('Failed to recompute loads after Garmin sync:', err)
    }
  }

  // Save refreshed tokens + update sync timestamp
  try {
    await saveTokens()
    await supabase
      .from('garmin_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('user_id', userId)
  } catch (err) {
    console.error('Failed to save Garmin tokens:', err)
  }

  return result
}

async function loadRecentActivityMatches(userId: string, since: Date): Promise<ExistingActivity[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('activities')
    .select('id, title, start_time, duration_seconds, moving_seconds, distance_meters')
    .eq('user_id', userId)
    .gte('start_time', since.toISOString())
    .order('start_time', { ascending: false })
    .limit(200)

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    start_time: row.start_time,
    duration_seconds: row.duration_seconds,
    moving_seconds: row.moving_seconds,
    distance_meters: row.distance_meters,
    avg_hr: null,
    max_hr: null,
    avg_cadence: null,
    max_cadence: null,
    avg_power: null,
    max_power: null,
    avg_speed: null,
    max_speed: null,
    elevation_gain_meters: null,
    avg_temperature: null,
    max_temperature: null,
    training_effect_aerobic: null,
    training_effect_anaerobic: null,
    avg_respiration_rate: null,
    calories: null,
    sweat_loss_ml: null,
    garmin_training_load: null,
    has_power_meter: false,
    kilojoules: null,
    training_load: null,
  }))
}
