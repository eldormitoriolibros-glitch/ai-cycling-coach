import { NextResponse } from 'next/server'
import { importGarminCsv } from '@/lib/garmin/import'
import { buildFitImportRows, parseFitFile } from '@/lib/garmin/fit'
import { enrichActivities } from '@/lib/garmin/fit-enrich'
import { extractFitReport } from '@/lib/garmin/archive'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { recomputeActivityLoads, recomputeTrainingLoad } from '@/lib/training/rollup'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 50 * 1024 * 1024

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
    return NextResponse.json({ error: 'El archivo es demasiado grande (máx. 50 MB).' }, { status: 413 })
  }

  try {
    const name = file.name.toLowerCase()

    // Handle FIT, FIT.GZ, or ZIP (including Garmin's nested bulk-export archives)
    if (name.endsWith('.fit') || name.endsWith('.fit.gz') || name.endsWith('.zip')) {
      const arrayBuffer = await file.arrayBuffer()
      const buf = Buffer.from(arrayBuffer)

      const extract = await extractFitReport(buf, file.name)
      const fitBuffers = extract.fits
      const allParsed: Awaited<ReturnType<typeof parseFitFile>> = []
      for (const { data } of fitBuffers) {
        const activities = await parseFitFile(data).catch(() => [])
        allParsed.push(...activities)
      }

      if (allParsed.length === 0) {
        const onlyAux =
          fitBuffers.length > 0 && fitBuffers.every((f) => /METRICS|WELLNESS|MONITOR|SLEEP|HRV/i.test(f.name))
        const detail = onlyAux
          ? 'El archivo solo contiene FIT auxiliares (METRICS/WELLNESS), no la actividad. Exportá el original de la actividad: debe incluir un archivo *_ACTIVITY.fit.'
          : fitBuffers.length === 0
            ? `No se encontraron archivos FIT (tipo detectado: ${extract.topLevelKind}, ${extract.skipped.length} entrada(s) ignoradas).`
            : `Se encontraron ${fitBuffers.length} archivo(s) FIT pero ninguno tenía datos de actividad.`
        return NextResponse.json(
          { error: `${detail} Activá "Modo diagnóstico" para ver el detalle.` },
          { status: 422 }
        )
      }

      const supabaseAdmin = createAdminClient()
      const [{ data: profile }, { data: metrics }] = await Promise.all([
        supabaseAdmin.from('users').select('timezone').eq('id', user.id).maybeSingle(),
        supabaseAdmin.from('athlete_metrics').select('ftp, max_hr, resting_hr').eq('user_id', user.id).maybeSingle(),
      ])

      const ftp = metrics?.ftp ?? null
      const maxHr = metrics?.max_hr ?? null
      const restingHr = metrics?.resting_hr ?? null

      // First try to enrich existing Strava activities
      const enrichResult = await enrichActivities(user.id, allParsed, ftp, maxHr, restingHr)

      // Then create unmatched activities if requested
      let created = 0
      if (createMissing && enrichResult.unmatched.length > 0) {
        const items = await buildFitImportRows(
          user.id,
          enrichResult.unmatched,
          profile?.timezone || 'UTC',
          ftp,
          maxHr,
          restingHr
        )

        if (items.length > 0) {
          const rows = items.map((item) => item.row)
          const { data: upserted, error: insertError } = await supabaseAdmin
            .from('activities')
            .upsert(rows, { onConflict: 'user_id,source,external_id' })
            .select('id, external_id')

          if (insertError) throw new Error(insertError.message)

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
              respiration_rate: r.respirationRate,
              latitude: r.latitude,
              longitude: r.longitude,
            }))

            await supabaseAdmin.from('activity_samples').delete().eq('activity_id', dbRow.id)
            for (let i = 0; i < sampleRows.length; i += 1000) {
              await supabaseAdmin
                .from('activity_samples')
                .upsert(sampleRows.slice(i, i + 1000) as any, { onConflict: 'activity_id,offset_seconds' })
            }
          }

          created = items.length
        }
      }

      if (enrichResult.enriched + created > 0) {
        await recomputeActivityLoads(user.id)
        await recomputeTrainingLoad(user.id)
      }

      return NextResponse.json({
        parsed: allParsed.length,
        enriched: enrichResult.enriched,
        fieldsPatched: enrichResult.fieldsPatched,
        samplesAdded: enrichResult.samplesAdded,
        samplesReplaced: enrichResult.samplesReplaced,
        created,
        unmatched: enrichResult.unmatched.length - created,
      })
    }

    // CSV import (unchanged)
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
