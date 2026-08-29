import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export type ActivitySampleRow = {
  offset_seconds: number
  heart_rate: number | null
  power: number | null
  cadence: number | null
  speed: number | null
  elevation: number | null
  temperature: number | null
  respiration_rate: number | null
  latitude: number | null
  longitude: number | null
}

const PAGE_SIZE = 1000

const SAMPLE_SELECT =
  'offset_seconds, heart_rate, power, cadence, speed, elevation, temperature, respiration_rate, latitude, longitude'

/** PostgREST caps responses at 1000 rows; page through long rides. */
export async function loadActivitySamples(
  supabase: SupabaseClient<Database>,
  activityId: string
): Promise<ActivitySampleRow[]> {
  const samples: ActivitySampleRow[] = []

  for (let page = 0; ; page++) {
    const { data: chunk, error } = await supabase
      .from('activity_samples')
      .select(SAMPLE_SELECT)
      .eq('activity_id', activityId)
      .order('offset_seconds', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) throw error
    samples.push(...((chunk ?? []) as ActivitySampleRow[]))
    if (!chunk || chunk.length < PAGE_SIZE) break
  }

  return samples
}
