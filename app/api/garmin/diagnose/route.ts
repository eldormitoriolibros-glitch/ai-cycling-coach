import { NextResponse } from 'next/server'
import { inspectFitFile, parseFitFile } from '@/lib/garmin/fit'
import { findMatch, loadAllActivities } from '@/lib/garmin/fit-enrich'
import { extractFitReport } from '@/lib/garmin/archive'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Dry-run of the FIT import pipeline. Writes nothing; reports per-file what was
 * parsed, whether it matched an existing activity, and why sample merging would
 * or wouldn't fill in the missing streams.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const extract = await extractFitReport(buf, file.name)
  const fitBuffers = extract.fits

  const parsed: Array<{ source: string; activities: Awaited<ReturnType<typeof parseFitFile>> }> = []
  const parseFailures: string[] = []

  for (const { name, data } of fitBuffers) {
    try {
      const activities = await parseFitFile(data)
      if (activities.length === 0) {
        const info = await inspectFitFile(data).catch(() => null)
        parseFailures.push(
          info
            ? `${name}: sin actividad (${info.sessionCount} sesiones, ${info.recordCount} registros, ${info.lapCount} laps; contiene: ${info.topLevelKeys.join(', ') || 'nada'}) — ${describeFitKind(name)}`
            : `${name}: sin actividad legible`
        )
      } else {
        parsed.push({ source: name, activities })
      }
    } catch (err) {
      parseFailures.push(`${name}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  const archive = {
    topLevelKind: extract.topLevelKind,
    fileSizeBytes: buf.length,
    firstBytesHex: buf.subarray(0, 16).toString('hex'),
    skippedEntries: extract.skipped.slice(0, 40),
    skippedCount: extract.skipped.length,
    extractErrors: extract.errors.slice(0, 20),
  }

  if (fitBuffers.length === 0) {
    return NextResponse.json({
      fileName: file.name,
      fitFilesFound: 0,
      sessionsParsed: 0,
      totalActivitiesInDb: (await loadAllActivities(user.id)).length,
      archive,
      hint: buildNoFitHint(extract.topLevelKind, extract.skipped),
      reports: [],
    })
  }

  const candidates = await loadAllActivities(user.id)

  if (parsed.length === 0) {
    const onlyMetrics = fitBuffers.every((f) => /METRICS|WELLNESS|MONITOR|SLEEP|HRV/i.test(f.name))
    return NextResponse.json({
      fileName: file.name,
      fitFilesFound: fitBuffers.length,
      fitFileNames: fitBuffers.slice(0, 20).map((f) => f.name),
      sessionsParsed: 0,
      parseFailures: parseFailures.slice(0, 20),
      totalActivitiesInDb: candidates.length,
      archive,
      hint: onlyMetrics
        ? 'El zip solo contiene archivos auxiliares (METRICS/WELLNESS), no la actividad en sí. En Garmin Connect abrí la actividad → menú (⋯) → "Exportar original": el zip resultante debe incluir un archivo terminado en _ACTIVITY.fit.'
        : 'Se encontraron archivos FIT pero ninguno tenía datos de actividad. Revisá el detalle de abajo.',
      reports: [],
    })
  }

  const admin = createAdminClient()
  const taken = new Set<string>()
  const reports: any[] = []

  for (const { source, activities } of parsed) {
    for (const fit of activities) {
      const recs = fit.records
      const nonNull = (key: keyof (typeof recs)[number]) => recs.filter((r) => r[key] != null).length

      const match = findMatch(fit, candidates, taken)
      const report: any = {
        file: source,
        fitStartTime: fit.startTime,
        fitDurationSeconds: fit.durationSeconds,
        fitDistanceMeters: fit.distanceMeters,
        recordCount: recs.length,
        recordsWith: {
          heartRate: nonNull('heartRate'),
          temperature: nonNull('temperature'),
          respirationRate: nonNull('respirationRate'),
          power: nonNull('power'),
          cadence: nonNull('cadence'),
        },
        sessionLevel: {
          avgHr: fit.avgHr,
          avgTemperature: fit.avgTemperature,
          avgRespirationRate: fit.avgRespirationRate,
          trainingEffectAerobic: fit.trainingEffectAerobic,
          calories: fit.calories,
          distanceKm: fit.distanceMeters != null ? +(fit.distanceMeters / 1000).toFixed(2) : null,
        },
      }

      if (!match) {
        report.matched = false
        report.reason = 'Ninguna actividad existente dentro de la tolerancia de tiempo/distancia'
        // Show the closest candidates so the real cause (offset, duplicate,
        // already-taken match) is visible instead of just "no match".
        const fitMs = new Date(fit.startTime).getTime()
        report.nearest = candidates
          .map((c) => ({
            id: c.id,
            title: c.title,
            start_time: c.start_time,
            deltaMinutes: Math.round((new Date(c.start_time).getTime() - fitMs) / 60000),
            distanceKm: c.distance_meters != null ? +(c.distance_meters / 1000).toFixed(2) : null,
            alreadyTaken: taken.has(c.id),
          }))
          .sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes))
          .slice(0, 5)
        reports.push(report)
        continue
      }

      taken.add(match.activity.id)
      report.matched = true
      report.matchedVia = match.via
      report.matchedActivity = {
        id: match.activity.id,
        title: match.activity.title,
        start_time: match.activity.start_time,
        avg_hr: match.activity.avg_hr,
        avg_temperature: match.activity.avg_temperature,
      }

      const { count: sampleCount } = await admin
        .from('activity_samples')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', match.activity.id)

      report.existingSampleCount = sampleCount ?? 0

      if ((sampleCount ?? 0) > 0) {
        const { data: bounds } = await admin
          .from('activity_samples')
          .select('offset_seconds, heart_rate, temperature')
          .eq('activity_id', match.activity.id)
          .order('offset_seconds', { ascending: true })
          .limit(1)
        const { data: lastRow } = await admin
          .from('activity_samples')
          .select('offset_seconds')
          .eq('activity_id', match.activity.id)
          .order('offset_seconds', { ascending: false })
          .limit(1)

        const fitOffsets = recs.map((r) => r.offsetSeconds)
        report.offsets = {
          existingMin: (bounds as any)?.[0]?.offset_seconds ?? null,
          existingMax: (lastRow as any)?.[0]?.offset_seconds ?? null,
          fitMin: fitOffsets.length ? Math.min(...fitOffsets) : null,
          fitMax: fitOffsets.length ? Math.max(...fitOffsets) : null,
        }
      }

      reports.push(report)
    }
  }

  return NextResponse.json({
    fileName: file.name,
    fitFilesFound: fitBuffers.length,
    fitFileNames: fitBuffers.slice(0, 20).map((f) => f.name),
    sessionsParsed: reports.length,
    parseFailures: parseFailures.slice(0, 20),
    totalActivitiesInDb: candidates.length,
    archive,
    reports: reports.slice(0, 50),
  })
}

/**
 * Garmin ships several FIT files per activity. Only the *_ACTIVITY one holds the
 * ride; the others carry wellness/metrics data with no session to import.
 */
function describeFitKind(name: string): string {
  const upper = name.toUpperCase()
  if (upper.includes('METRICS')) {
    return 'es un archivo METRICS (métricas fisiológicas), no contiene la salida. Necesitás el archivo *_ACTIVITY.fit'
  }
  if (upper.includes('WELLNESS') || upper.includes('MONITOR')) {
    return 'es un archivo de bienestar/monitoreo diario, no una actividad'
  }
  if (upper.includes('SLEEP')) return 'es un archivo de sueño, no una actividad'
  if (upper.includes('HRV')) return 'es un archivo de HRV, no una actividad'
  return 'no contiene mensajes de sesión ni registros con marca de tiempo'
}

function buildNoFitHint(kind: string, skipped: string[]): string {
  const exts = Array.from(
    new Set(skipped.map((n) => (n.includes('.') ? n.slice(n.lastIndexOf('.')).toLowerCase() : '(sin extensión)')))
  ).slice(0, 10)

  if (kind === 'text') {
    return 'El archivo subido es texto (probablemente el CSV de la lista de actividades de Garmin). El CSV no contiene datos por segundo: necesitás los archivos .FIT. En Garmin Connect abrí una actividad → menú (⋯) → "Exportar original", o pedí la exportación completa de datos.'
  }
  if (kind === 'zip') {
    return `El zip se abrió pero no contenía archivos FIT. Extensiones encontradas dentro: ${exts.join(', ') || 'ninguna'}. Si es la exportación completa de Garmin, los FIT suelen estar en DI_CONNECT/DI-Connect-Uploaded-Files dentro de zips anidados.`
  }
  if (kind === 'unknown') {
    return 'No se reconoció el formato del archivo. Debe ser un .FIT, un .FIT.GZ, o un .ZIP que contenga archivos FIT.'
  }
  return 'No se encontraron archivos FIT en el archivo subido.'
}
