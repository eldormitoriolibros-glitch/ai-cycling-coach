import { createAdminClient } from '@/lib/supabase/admin'
import { getGarminClient } from './client'
import { downloadActivityFits, ingestFitActivities, loadThresholds } from './activity-sync'
import type { ParsedFitActivity } from './fit'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'

import 'server-only'

export type SyncResult = {
  activitiesEnriched: number
  activitiesCreated: number
  samplesAdded: number
  healthDaysUpdated: number
  error?: string
}

export async function syncGarminData(userId: string): Promise<SyncResult> {
  const supabase = createAdminClient()
  const result: SyncResult = {
    activitiesEnriched: 0,
    activitiesCreated: 0,
    samplesAdded: 0,
    healthDaysUpdated: 0,
  }

  const garmin = await getGarminClient(userId)
  if (!garmin) return { ...result, error: 'No Garmin connection found' }

  const { client, saveTokens } = garmin

  const [thresholds, { data: connRow }] = await Promise.all([
    loadThresholds(userId),
    supabase.from('garmin_connections').select('last_sync_at').eq('user_id', userId).maybeSingle(),
  ])

  const lastSync = connRow?.last_sync_at ? new Date(connRow.last_sync_at) : new Date(Date.now() - 30 * 86_400_000)

  // --- Activities sync ---
  try {
    const activities = await client.getActivities(0, 50)
    const recent = (activities ?? []).filter((a: any) => {
      const start = new Date(a.startTimeGMT || a.startTimeLocal || 0)
      return start >= lastSync
    })

    const fitActivities: ParsedFitActivity[] = []
    for (const activity of recent) {
      try {
        fitActivities.push(...(await downloadActivityFits(client, activity)))
      } catch (err) {
        console.error(`Garmin sync: failed to download activity ${activity.activityId}:`, err)
      }
    }

    const totals = await ingestFitActivities(userId, fitActivities, thresholds)
    result.activitiesEnriched = totals.enriched
    result.activitiesCreated = totals.created
    result.samplesAdded = totals.samplesAdded + totals.samplesReplaced
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
  if (result.activitiesEnriched + result.activitiesCreated > 0) {
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
