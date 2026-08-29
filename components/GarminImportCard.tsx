'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'

type Result = {
  parsed: number
  withHeartRate?: number
  matched?: number
  updated?: number
  enriched?: number
  fieldsPatched?: string[]
  samplesAdded?: number
  samplesReplaced?: number
  created: number
  removedDuplicates?: number
  unmatched: number
  unit?: 'km' | 'mi'
  activitiesRecalculated?: number
}

export function GarminImportCard() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [createMissing, setCreateMissing] = useState(true)
  const [diagnoseMode, setDiagnoseMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [diagnosis, setDiagnosis] = useState<any>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setDiagnosis(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('createMissing', String(createMissing))

      const endpoint = diagnoseMode ? '/api/garmin/diagnose' : '/api/garmin/import'
      const response = await fetch(endpoint, { method: 'POST', body: form })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'No se pudo importar.')

      if (diagnoseMode) setDiagnosis(body)
      else {
        setResult(body)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">Importar CSV de Garmin</h2>
        <p className="text-sm text-slate-600">
          Strava no siempre recibe la frecuencia cardíaca de tu Garmin. Exportá la lista de
          actividades desde Garmin Connect o subí un FIT exportado desde tu equipo y traé el pulso acá.
        </p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-500">
        <li>Garmin Connect (web) → Actividades → Todas las actividades</li>
        <li>Filtrá por ciclismo y bajá hasta cargar todo el período que quieras</li>
        <li>Botón de exportar (arriba a la derecha) → se descarga un CSV</li>
        <li>O exportá el archivo FIT desde el dispositivo y subilo acá</li>
        <li>Subilo acá</li>
      </ol>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          checked={createMissing}
          disabled={busy}
          onChange={(e) => setCreateMissing(e.target.checked)}
        />
        <span>
          Crear las actividades que no estén en Strava
          <span className="block text-xs text-slate-500">
            Usa la zona horaria de tu perfil para ubicarlas en el día correcto. Si después aparecen
            en Strava, la copia manual se elimina sola.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          checked={diagnoseMode}
          disabled={busy}
          onChange={(e) => setDiagnoseMode(e.target.checked)}
        />
        <span>
          Modo diagnóstico (no escribe nada)
          <span className="block text-xs text-slate-500">
            Analiza el archivo y muestra qué se leyó, con qué actividad emparejó y por qué faltan datos.
          </span>
        </span>
      </label>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.fit,.gz,.zip"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload(file)
        }}
        className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-50 disabled:opacity-50"
      />

      {busy && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Upload aria-hidden className="h-4 w-4 animate-pulse" />
          Procesando…
        </p>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {diagnosis && (
        <div className="space-y-2 rounded-md border border-slate-300 bg-slate-50 p-3 text-xs">
          <p className="font-semibold text-slate-800">
            {diagnosis.fitFilesFound} archivo(s) FIT encontrados · {diagnosis.sessionsParsed} sesión(es) ·{' '}
            {diagnosis.totalActivitiesInDb} actividades en la base
          </p>

          {diagnosis.hint && (
            <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">{diagnosis.hint}</p>
          )}

          {diagnosis.archive && (
            <div className="text-slate-600">
              <p>
                Tipo detectado: <strong>{diagnosis.archive.topLevelKind}</strong> ·{' '}
                {(diagnosis.archive.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
              </p>
              {diagnosis.archive.extractErrors?.length > 0 && (
                <p className="text-red-700">Errores: {diagnosis.archive.extractErrors.join(' | ')}</p>
              )}
              {diagnosis.archive.skippedCount > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">
                    {diagnosis.archive.skippedCount} entrada(s) ignoradas dentro del archivo
                  </summary>
                  <ul className="mt-1 max-h-40 overflow-y-auto pl-4">
                    {diagnosis.archive.skippedEntries.map((n: string, i: number) => (
                      <li key={i} className="truncate font-mono text-[10px]">{n}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {diagnosis.parseFailures?.length > 0 && (
            <p className="text-red-700">Fallos de lectura: {diagnosis.parseFailures.join(' | ')}</p>
          )}

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {diagnosis.reports?.map((r: any, i: number) => (
              <div key={i} className="rounded border border-slate-200 bg-white p-2">
                <p className="font-medium text-slate-700">
                  {new Date(r.fitStartTime).toLocaleString('es-AR')} ·{' '}
                  {r.fitDistanceMeters ? `${(r.fitDistanceMeters / 1000).toFixed(1)} km` : 'sin distancia'}
                </p>
                <p className="text-slate-600">
                  Registros: {r.recordCount} · con pulso: {r.recordsWith.heartRate} · temp:{' '}
                  {r.recordsWith.temperature} · respiración: {r.recordsWith.respirationRate}
                </p>
                {r.matched ? (
                  <>
                    <p className="text-green-700">
                      Emparejada ({r.matchedVia}) con &quot;{r.matchedActivity.title ?? 'sin título'}&quot;
                    </p>
                    <p className="text-slate-600">
                      Muestras existentes: {r.existingSampleCount}
                      {r.offsets && (
                        <>
                          {' '}· offsets existentes {r.offsets.existingMin}–{r.offsets.existingMax} · offsets FIT{' '}
                          {r.offsets.fitMin}–{r.offsets.fitMax}
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-red-700">Sin emparejar: {r.reason}</p>
                    {r.nearest?.length > 0 && (
                      <div className="mt-1">
                        <p className="text-slate-500">Actividades más cercanas en la base:</p>
                        <ul className="pl-3">
                          {r.nearest.map((n: any) => (
                            <li key={n.id} className="text-slate-600">
                              {new Date(n.start_time).toLocaleString('es-AR')} ·{' '}
                              {n.distanceKm != null ? `${n.distanceKm} km` : 's/d'} ·{' '}
                              <strong>
                                {n.deltaMinutes > 0 ? '+' : ''}
                                {n.deltaMinutes} min
                              </strong>
                              {n.alreadyTaken && ' · ya emparejada con otro FIT'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <Alert variant={(result.enriched ?? 0) + (result.updated ?? 0) + result.created > 0 ? 'success' : 'info'}>
          {result.parsed} actividades leídas
          {(result.enriched ?? 0) > 0 && (
            <>
              {' · '}
              <strong>{result.enriched} enriquecidas</strong>
              {result.fieldsPatched && result.fieldsPatched.length > 0 && (
                <> ({result.fieldsPatched.map(f => f.replace(/_/g, ' ')).join(', ')})</>
              )}
            </>
          )}
          {(result.samplesAdded ?? 0) > 0 && (
            <> · {result.samplesAdded} con muestras parcheadas</>
          )}
          {(result.samplesReplaced ?? 0) > 0 && (
            <> · <strong>{result.samplesReplaced} con muestras reemplazadas por datos completos del FIT</strong></>
          )}
          {(result.matched ?? 0) > 0 && (
            <> · {result.matched} emparejadas</>
          )}
          {(result.updated ?? 0) > 0 && (
            <> · <strong>{result.updated} actualizadas</strong></>
          )}
          {result.created > 0 && (
            <> · <strong>{result.created} creadas</strong></>
          )}
          {(result.activitiesRecalculated ?? 0) > 0 && (
            <> · carga recalculada en {result.activitiesRecalculated} actividades</>
          )}
          {(result.removedDuplicates ?? 0) > 0 && (
            <>
              <br />
              {result.removedDuplicates} duplicada(s) descartada(s) porque ya existían en Strava.
            </>
          )}
          {(result.enriched ?? 0) + (result.updated ?? 0) + result.created + (result.samplesReplaced ?? 0) + (result.samplesAdded ?? 0) === 0 && (
            <>
              <br />
              Tus actividades ya tienen todos los datos disponibles en el archivo.
            </>
          )}
        </Alert>
      )}
    </Card>
  )
}
