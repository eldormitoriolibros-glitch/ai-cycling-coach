import { createAdminClient } from '@/lib/supabase/admin'
import { estimateTrainingLoad } from '@/lib/training/load'
import type { ParsedFitActivity } from './fit'

import 'server-only'

const TIME_TOLERANCE_MS = 5 * 60 * 1000
const DURATION_TOLERANCE_S = 300
const DISTANCE_TOLERANCE_RATIO = 0.015
const DISTANCE_TOLERANCE_MIN_M = 250

export type ExistingActivity = {
  id: string
  title: string | null
  start_time: string
  duration_seconds: number | null
  moving_seconds: number | null
  distance_meters: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_power: number | null
  max_power: number | null
  avg_speed: number | null
  max_speed: number | null
  elevation_gain_meters: number | null
  avg_temperature: number | null
  max_temperature: number | null
  training_effect_aerobic: number | null
  training_effect_anaerobic: number | null
  avg_respiration_rate: number | null
  calories: number | null
  sweat_loss_ml: number | null
  garmin_training_load: number | null
  has_power_meter: boolean
  kilojoules: number | null
  training_load: number | null
}

export type EnrichResult = {
  enriched: number
  fieldsPatched: string[]
  samplesAdded: number
  samplesReplaced: number
  unmatched: ParsedFitActivity[]
}

const ENRICH_SELECT = 'id, title, start_time, duration_seconds, moving_seconds, distance_meters, avg_hr, max_hr, avg_cadence, max_cadence, avg_power, max_power, avg_speed, max_speed, elevation_gain_meters, avg_temperature, max_temperature, training_effect_aerobic, training_effect_anaerobic, avg_respiration_rate, calories, sweat_loss_ml, garmin_training_load, has_power_meter, kilojoules, training_load'

/**
 * Loads every activity for the user. PostgREST caps a single response at ~1000
 * rows, so a multi-year history silently truncates without paging.
 */
export async function loadAllActivities(userId: string): Promise<ExistingActivity[]> {
  const supabase = createAdminClient()
  const PAGE = 1000
  const all: ExistingActivity[] = []

  for (let page = 0; ; page++) {
    const { data: chunk } = await supabase
      .from('activities')
      .select(ENRICH_SELECT)
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)

    all.push(...((chunk ?? []) as unknown as ExistingActivity[]))
    if (!chunk || chunk.length < PAGE) break
  }

  return all
}

/** Finds the best existing activity for a parsed FIT session, or null. */
export function findMatch(
  fit: ParsedFitActivity,
  candidates: ExistingActivity[],
  taken: Set<string>
): { activity: ExistingActivity; via: 'time' | 'distance+duration'; score: number } | null {
  const fitStart = new Date(fit.startTime).getTime()
  if (Number.isNaN(fitStart)) return null

  let best: ExistingActivity | null = null
  let bestScore = Infinity
  let bestVia: 'time' | 'distance+duration' = 'time'

  for (const act of candidates) {
    if (taken.has(act.id)) continue
    const actStart = new Date(act.start_time).getTime()

    const timeDelta = Math.abs(actStart - fitStart)
    if (timeDelta <= TIME_TOLERANCE_MS) {
      const score = timeDelta / TIME_TOLERANCE_MS
      if (score < bestScore) {
        best = act
        bestScore = score
        bestVia = 'time'
      }
      continue
    }

    const fitDist = fit.distanceMeters
    const actDist = act.distance_meters
    const fitDur = fit.durationSeconds
    const actDur = act.moving_seconds ?? act.duration_seconds

    if (fitDist != null && actDist != null && fitDur != null && actDur != null) {
      const distDelta = Math.abs(actDist - fitDist)
      const durDelta = Math.abs(actDur - fitDur)
      const distAllowed = Math.max(DISTANCE_TOLERANCE_MIN_M, fitDist * DISTANCE_TOLERANCE_RATIO)

      if (distDelta <= distAllowed && durDelta <= DURATION_TOLERANCE_S) {
        const score = 1 + distDelta / distAllowed + durDelta / DURATION_TOLERANCE_S
        if (score < bestScore) {
          best = act
          bestScore = score
          bestVia = 'distance+duration'
        }
      }
    }
  }

  return best ? { activity: best, via: bestVia, score: bestScore } : null
}

/**
 * Match parsed FIT activities against existing DB activities and patch NULL fields.
 * Returns enrichment stats and the list of unmatched FIT activities.
 */
export async function enrichActivities(
  userId: string,
  fitActivities: ParsedFitActivity[],
  ftp: number | null,
  maxHr: number | null,
  restingHr: number | null
): Promise<EnrichResult> {
  const supabase = createAdminClient()

  const candidates = await loadAllActivities(userId)
  const matched = new Set<string>()
  let enriched = 0
  let samplesAdded = 0
  let samplesReplaced = 0
  const allPatchedFields: string[] = []
  const unmatched: ParsedFitActivity[] = []

  for (const fit of fitActivities) {
    const match = findMatch(fit, candidates, matched)

    if (!match) {
      unmatched.push(fit)
      continue
    }

    const best = match.activity
    matched.add(best.id)

    // Build patch: only fill NULL fields
    const patch: Record<string, any> = {}
    const patchedFields: string[] = []

    const tryPatch = (field: string, existingVal: any, fitVal: any) => {
      if (existingVal == null && fitVal != null) {
        patch[field] = typeof fitVal === 'number' && ['avg_hr', 'max_hr', 'avg_cadence', 'max_cadence'].includes(field)
          ? Math.round(fitVal)
          : fitVal
        patchedFields.push(field)
      }
    }

    tryPatch('avg_hr', best.avg_hr, fit.avgHr)
    tryPatch('max_hr', best.max_hr, fit.maxHr)
    tryPatch('avg_cadence', best.avg_cadence, fit.avgCadence)
    tryPatch('max_cadence', best.max_cadence, fit.maxCadence)
    tryPatch('avg_power', best.avg_power, fit.avgPower)
    tryPatch('max_power', best.max_power, fit.maxPower)
    tryPatch('avg_speed', best.avg_speed, fit.avgSpeed)
    tryPatch('max_speed', best.max_speed, fit.maxSpeed)
    tryPatch('elevation_gain_meters', best.elevation_gain_meters, fit.elevationGain)
    tryPatch('avg_temperature', best.avg_temperature, fit.avgTemperature)
    tryPatch('max_temperature', best.max_temperature, fit.maxTemperature)
    tryPatch('training_effect_aerobic', best.training_effect_aerobic, fit.trainingEffectAerobic)
    tryPatch('training_effect_anaerobic', best.training_effect_anaerobic, fit.trainingEffectAnaerobic)
    tryPatch('avg_respiration_rate', best.avg_respiration_rate, fit.avgRespirationRate)
    tryPatch('calories', best.calories, fit.calories)
    tryPatch('kilojoules', best.kilojoules, fit.kilojoules)
    tryPatch('sweat_loss_ml', best.sweat_loss_ml, fit.sweatLossMl)
    tryPatch('garmin_training_load', best.garmin_training_load, fit.garminTrainingLoad)

    if (!best.has_power_meter && fit.hasPowerMeter) {
      patch.has_power_meter = true
      patchedFields.push('has_power_meter')
    }

    // Recompute training load if we filled power or HR
    if (patchedFields.includes('avg_hr') || patchedFields.includes('avg_power')) {
      const dur = best.moving_seconds ?? best.duration_seconds ?? fit.durationSeconds ?? 0
      const { trainingLoad, intensityFactor } = estimateTrainingLoad({
        durationSeconds: dur,
        normalizedPower: null,
        averagePower: patch.avg_power ?? best.avg_power ?? null,
        averageHr: patch.avg_hr ?? best.avg_hr ?? null,
        ftp,
        maxHr,
        restingHr,
      })
      if (trainingLoad !== null && (best.training_load == null || trainingLoad > best.training_load)) {
        patch.training_load = trainingLoad
        patch.intensity_factor = intensityFactor
      }
    }

    let activityTouched = false
    if (Object.keys(patch).length > 0) {
      await supabase.from('activities').update(patch as any).eq('id', best.id)
      activityTouched = true
      allPatchedFields.push(...patchedFields)
    }

    // Enrich or create activity_samples
    if (fit.records.length > 0) {
      const { count } = await supabase
        .from('activity_samples')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', best.id)

      if ((count ?? 0) === 0) {
        // No samples exist yet -- write all FIT records
        const sampleRows = fit.records.map((r) => ({
          user_id: userId,
          activity_id: best!.id,
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

        for (let i = 0; i < sampleRows.length; i += 1000) {
          await supabase
            .from('activity_samples')
            .upsert(sampleRows.slice(i, i + 1000) as any, { onConflict: 'activity_id,offset_seconds' })
        }
        samplesAdded++
      } else {
        // Samples exist (likely from Strava) -- merge NULL fields from FIT data
        const fitHasExtra = fit.records.some((r) =>
          r.temperature != null || r.power != null || r.heartRate != null ||
          r.cadence != null || r.speed != null || r.respirationRate != null
        )

        if (fitHasExtra) {
          // Build sorted FIT offsets for nearest-neighbor lookup (±2s tolerance)
          const fitSorted = [...fit.records].sort((a, b) => a.offsetSeconds - b.offsetSeconds)
          const fitByOffset = new Map(fit.records.map((r) => [r.offsetSeconds, r]))

          const findFitRecord = (offset: number) => {
            // Exact match first
            const exact = fitByOffset.get(offset)
            if (exact) return exact
            // ±1s, ±2s
            for (const delta of [-1, 1, -2, 2]) {
              const nearby = fitByOffset.get(offset + delta)
              if (nearby) return nearby
            }
            // Binary search for nearest within ±2s
            let lo = 0, hi = fitSorted.length - 1
            while (lo <= hi) {
              const mid = (lo + hi) >> 1
              if (fitSorted[mid].offsetSeconds < offset) lo = mid + 1
              else hi = mid - 1
            }
            for (const idx of [lo, lo - 1]) {
              if (idx >= 0 && idx < fitSorted.length && Math.abs(fitSorted[idx].offsetSeconds - offset) <= 2) {
                return fitSorted[idx]
              }
            }
            return null
          }

          // Paginate to load all existing samples
          const existingSamples: any[] = []
          const SAMPLE_PAGE = 1000
          for (let pg = 0; ; pg++) {
            const { data: chunk } = await supabase
              .from('activity_samples')
              .select('offset_seconds, temperature, respiration_rate, power, heart_rate, cadence, speed, elevation, latitude, longitude')
              .eq('activity_id', best.id)
              .order('offset_seconds', { ascending: true })
              .range(pg * SAMPLE_PAGE, pg * SAMPLE_PAGE + SAMPLE_PAGE - 1)
            existingSamples.push(...(chunk ?? []))
            if (!chunk || chunk.length < SAMPLE_PAGE) break
          }

          let matchedSamples = 0
          const upsertRows: any[] = []
          for (const existing of existingSamples) {
            const fitRecord = findFitRecord(existing.offset_seconds)
            if (!fitRecord) continue
            matchedSamples++

            let changed = false
            const row: Record<string, any> = {
              user_id: userId,
              activity_id: best!.id,
              offset_seconds: existing.offset_seconds,
              heart_rate: existing.heart_rate,
              power: existing.power,
              cadence: existing.cadence,
              speed: existing.speed,
              elevation: existing.elevation,
              latitude: existing.latitude,
              longitude: existing.longitude,
              temperature: existing.temperature,
              respiration_rate: existing.respiration_rate,
            }

            const patchField = (existingVal: any, fitVal: any, key: string) => {
              if (existingVal == null && fitVal != null) {
                row[key] = fitVal
                changed = true
              }
            }
            patchField(existing.temperature, fitRecord.temperature, 'temperature')
            patchField(existing.power, fitRecord.power, 'power')
            patchField(existing.heart_rate, fitRecord.heartRate, 'heart_rate')
            patchField(existing.cadence, fitRecord.cadence, 'cadence')
            patchField(existing.speed, fitRecord.speed, 'speed')
            patchField(existing.respiration_rate, fitRecord.respirationRate, 'respiration_rate')
            if (changed) upsertRows.push(row)
          }

          // If very few Strava samples matched FIT records (< 10%), the offset bases
          // are incompatible. Fall back to replacing all samples with FIT data.
          const matchRatio = existingSamples.length > 0 ? matchedSamples / existingSamples.length : 0
          if (matchRatio < 0.1 && fit.records.length > 0) {
            await supabase.from('activity_samples').delete().eq('activity_id', best!.id)
            const sampleRows = fit.records.map((r) => ({
              user_id: userId,
              activity_id: best!.id,
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
            for (let i = 0; i < sampleRows.length; i += 1000) {
              await supabase
                .from('activity_samples')
                .upsert(sampleRows.slice(i, i + 1000) as any, { onConflict: 'activity_id,offset_seconds' })
            }
            samplesReplaced++
          } else if (upsertRows.length > 0) {
            for (let i = 0; i < upsertRows.length; i += 1000) {
              await supabase
                .from('activity_samples')
                .upsert(upsertRows.slice(i, i + 1000) as any, { onConflict: 'activity_id,offset_seconds' })
            }
            samplesAdded++
          }
        }
      }
      activityTouched = true
    }

    if (activityTouched) enriched++
  }

  return {
    enriched,
    fieldsPatched: Array.from(new Set(allPatchedFields)),
    samplesAdded,
    samplesReplaced,
    unmatched,
  }
}
