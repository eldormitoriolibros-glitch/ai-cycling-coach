import { NextResponse } from 'next/server'
import { importGarminCsv } from '@/lib/garmin/import'
import { buildFitImportRows, parseFitFile } from '@/lib/garmin/fit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let file: File | null = null
  let createMissing = false
  try {
    const form = await request.formData()
    const entry = form.get('file')
    if (entry instanceof File) file = entry
    createMissing = form.get('createMissing') === 'true'
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo.' }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo es demasiado grande (máx. 5 MB).' }, { status: 413 })
  }

  try {
    const name = file.name.toLowerCase()
    if (name.endsWith('.fit') || name.endsWith('.fit.gz')) {
      const arrayBuffer = await file.arrayBuffer()
      const parsed = await parseFitFile(Buffer.from(arrayBuffer))
      if (parsed.length === 0) {
        return NextResponse.json(
          { error: 'No se pudo leer el FIT. Probá con un archivo exportado desde Garmin o un dispositivo compatible.' },
          { status: 422 }
        )
      }

      const supabaseAdmin = createAdminClient()
      const [{ data: profile }, { data: metrics }] = await Promise.all([
        supabaseAdmin.from('users').select('timezone').eq('id', user.id).maybeSingle(),
        supabaseAdmin.from('athlete_metrics').select('ftp, max_hr, resting_hr').eq('user_id', user.id).maybeSingle(),
      ])

      const items = await buildFitImportRows(
        user.id,
        parsed,
        profile?.timezone || 'UTC',
        metrics?.ftp ?? null,
        metrics?.max_hr ?? null,
        metrics?.resting_hr ?? null
      )

      if (items.length === 0) {
        return NextResponse.json({ error: 'El FIT no contiene actividades útiles.' }, { status: 422 })
      }

      const rows = items.map((item) => item.row)

      const { data: upserted, error: insertError } = await supabaseAdmin
        .from('activities')
        .upsert(rows, { onConflict: 'user_id,source,external_id' })
        .select('id, external_id')

      if (insertError) throw new Error(insertError.message)

      // Store per-second samples (HR, power, cadence, speed, elevation, GPS) for real charts.
      for (const dbRow of upserted ?? []) {
        const match = items.find((item) => item.externalId === dbRow.external_id)
        if (!match || match.records.length === 0) continue

        const sampleRows = match.records.map((r) => ({
          user_id: user.id,
          activity_id: dbRow.id,
          offset_seconds: r.offsetSeconds,
          heart_rate: r.heartRate,
          power: r.power,
          cadence: r.cadence,
          speed: r.speed,
          elevation: r.elevation,
          temperature: r.temperature,
          latitude: r.latitude,
          longitude: r.longitude,
        }))

        await supabaseAdmin.from('activity_samples').delete().eq('activity_id', dbRow.id)
        for (let i = 0; i < sampleRows.length; i += 1000) {
          const { error: sampleError } = await supabaseAdmin
            .from('activity_samples')
            .upsert(sampleRows.slice(i, i + 1000) as any, { onConflict: 'activity_id,offset_seconds' })
          if (sampleError) {
            console.error(`FIT import: failed to store samples for activity ${dbRow.id}:`, sampleError.message)
          }
        }
      }

      const activitiesRecalculated = await recomputeActivityLoads(user.id)
      await recomputeTrainingLoad(user.id)

      return NextResponse.json({
        parsed: rows.length,
        withHeartRate: rows.filter((row) => row.avg_hr !== null || row.max_hr !== null).length,
        matched: rows.length,
        updated: rows.length,
        created: rows.length,
        removedDuplicates: 0,
        unmatched: 0,
        unit: 'km',
        activitiesRecalculated,
      })
    }

    const result = await importGarminCsv(user.id, await file.text(), { createMissing })

    if (result.parsed === 0) {
      return NextResponse.json(
        { error: 'No se reconoció el formato. Usá el CSV de la lista de actividades de Garmin Connect.' },
        { status: 422 }
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo importar el archivo.' },
      { status: 500 }
    )
  }
}
