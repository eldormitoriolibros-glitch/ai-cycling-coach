'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'

type Result = {
  parsed: number
  withHeartRate: number
  matched: number
  updated: number
  created: number
  removedDuplicates: number
  unmatched: number
  unit: 'km' | 'mi'
  activitiesRecalculated: number
}

export function GarminImportCard() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [createMissing, setCreateMissing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('createMissing', String(createMissing))

      const response = await fetch('/api/garmin/import', { method: 'POST', body: form })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'No se pudo importar.')

      setResult(body)
      router.refresh()
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

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.fit"
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

      {result && (
        <Alert variant={result.updated + result.created > 0 ? 'success' : 'info'}>
          {result.parsed} filas leídas · {result.matched} emparejadas ·{' '}
          <strong>{result.updated} actualizadas</strong>
          {result.created > 0 && (
            <>
              {' '}
              · <strong>{result.created} creadas</strong>
            </>
          )}
          {result.activitiesRecalculated > 0 && (
            <> · carga recalculada en {result.activitiesRecalculated} actividades</>
          )}
          {result.removedDuplicates > 0 && (
            <>
              <br />
              {result.removedDuplicates} duplicada(s) descartada(s) porque ya existían en Strava.
            </>
          )}
          {result.updated + result.created === 0 && result.matched > 0 && (
            <>
              <br />
              Esas actividades ya tenían los datos cargados.
            </>
          )}
        </Alert>
      )}
    </Card>
  )
}
