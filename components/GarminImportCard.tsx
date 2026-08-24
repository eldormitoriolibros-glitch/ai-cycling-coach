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
  unmatched: number
  unit: 'km' | 'mi'
  activitiesRecalculated: number
}

export function GarminImportCard() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)

    try {
      const form = new FormData()
      form.append('file', file)

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
          actividades desde Garmin Connect y traé el pulso acá.
        </p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-500">
        <li>Garmin Connect (web) → Actividades → Todas las actividades</li>
        <li>Filtrá por ciclismo y bajá hasta cargar todo el período que quieras</li>
        <li>Botón de exportar (arriba a la derecha) → se descarga un CSV</li>
        <li>Subilo acá</li>
      </ol>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
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
        <Alert variant={result.updated > 0 ? 'success' : 'info'}>
          {result.parsed} filas leídas · {result.withHeartRate} con pulso · {result.matched}{' '}
          emparejadas · <strong>{result.updated} actualizadas</strong>
          {result.activitiesRecalculated > 0 && (
            <> · carga recalculada en {result.activitiesRecalculated} actividades</>
          )}
          {result.unmatched > 0 && (
            <>
              <br />
              {result.unmatched} sin pareja (no están sincronizadas desde Strava, o difieren en
              distancia o duración).
            </>
          )}
          {result.updated === 0 && result.matched > 0 && (
            <>
              <br />
              Esas actividades ya tenían pulso cargado.
            </>
          )}
        </Alert>
      )}
    </Card>
  )
}
