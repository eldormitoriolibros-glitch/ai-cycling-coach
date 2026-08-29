'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card } from '@/components/ui'

type ConnectionState = {
  connected: boolean
  email: string | null
  lastSyncAt: string | null
  lastSyncError: string | null
}

type BackfillState = {
  status: 'idle' | 'running' | 'done' | 'error'
  processed: number
  error?: string
}

type SyncResult = {
  activitiesEnriched: number
  activitiesCreated: number
  samplesAdded: number
  healthDaysUpdated: number
  error?: string
}

export function GarminConnectCard({ initial }: { initial: ConnectionState }) {
  const router = useRouter()
  const [state, setState] = useState(initial)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [needsMfa, setNeedsMfa] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [backfill, setBackfill] = useState<BackfillState | null>(null)
  const cancelBackfill = useRef(false)
  const runningRef = useRef(false)

  /**
   * Walks the history in chunks. The server keeps the cursor, so closing the
   * page pauses rather than loses progress — reopening Settings resumes.
   */
  const runBackfill = async (restart: boolean) => {
    if (runningRef.current) return
    runningRef.current = true
    cancelBackfill.current = false
    setError(null)
    setBackfill((prev) => ({
      status: 'running',
      processed: restart ? 0 : prev?.processed ?? 0,
      error: undefined,
    }))

    let first = restart
    try {
      for (;;) {
        if (cancelBackfill.current) {
          setBackfill((p) => (p ? { ...p, status: 'idle' } : null))
          return
        }

        let data: any
        try {
          const res = await fetch('/api/garmin/backfill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restart: first }),
          })
          data = await res.json()
          if (!res.ok && !data?.status) {
            setBackfill({
              status: 'error',
              processed: data.processed ?? 0,
              error: data.error || `Error HTTP ${res.status}`,
            })
            return
          }
        } catch {
          setBackfill((p) => ({
            status: 'error',
            processed: p?.processed ?? 0,
            error: 'Fallo de red',
          }))
          return
        }
        first = false

        setBackfill({
          status: data.status,
          processed: data.processed ?? 0,
          error: data.error,
        })

        if (data.done || data.status === 'error') break
      }

      router.refresh()
    } finally {
      runningRef.current = false
    }
  }

  // Restore / resume any backfill left mid-run from a previous visit.
  useEffect(() => {
    if (!initial.connected) return
    let cancelled = false
    fetch('/api/garmin/backfill')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.backfill_status) return
        if (d.backfill_status === 'idle') return
        setBackfill({
          status: d.backfill_status,
          processed: d.backfill_processed ?? 0,
          error: d.backfill_error ?? undefined,
        })
        if (d.backfill_status === 'running') {
          runBackfill(false)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.connected])

  const handleConnect = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/garmin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mfaCode: needsMfa ? mfaCode : undefined }),
      })
      const data = await res.json()
      if (data.needsMfa) {
        setNeedsMfa(true)
        setBusy(false)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Error al conectar')
      setState({ connected: true, email: data.email, lastSyncAt: null, lastSyncError: null })
      setPassword('')
      setMfaCode('')
      setNeedsMfa(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await fetch('/api/garmin/disconnect', { method: 'DELETE' })
      setState({ connected: false, email: null, lastSyncAt: null, lastSyncError: null })
      router.refresh()
    } catch {
      setError('Error al desconectar')
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res = await fetch('/api/garmin/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error de sincronización')
      setSyncResult(data)
      setState((prev) => ({ ...prev, lastSyncAt: new Date().toISOString(), lastSyncError: null }))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de sincronización')
    } finally {
      setSyncing(false)
    }
  }

  if (state.connected) {
    return (
      <Card className="space-y-4">
        <div>
          <h2 className="font-bold">Garmin Connect</h2>
          <p className="text-sm text-slate-600">
            Conectado como <strong>{state.email}</strong>
          </p>
        </div>

        {state.lastSyncAt && (
          <p className="text-xs text-slate-500">
            Última sincronización: {new Date(state.lastSyncAt).toLocaleString()}
          </p>
        )}

        {state.lastSyncError && (
          <Alert variant="error">Error en la última sincronización: {state.lastSyncError}</Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSync} disabled={syncing || backfill?.status === 'running'}>
            {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </Button>
          <Button variant="secondary" onClick={handleDisconnect} disabled={busy}>
            Desconectar
          </Button>
        </div>

        {syncResult && (
          <Alert variant="success">
            {formatSyncResult(syncResult)}
          </Alert>
        )}

        <div className="space-y-2 rounded-md border border-slate-300 p-3">
          <div>
            <h3 className="text-sm font-semibold">Importar historial completo</h3>
            <p className="text-xs text-slate-500">
              Trae todas tus actividades de Garmin, con datos por segundo (pulso, temperatura,
              respiración). Puede tardar bastante: se procesa de a poco y podés cerrar la página,
              el progreso se guarda.
            </p>
          </div>

          {backfill?.status === 'running' ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                {backfill.processed === 0 ? (
                  <>Iniciando… el primer lote tarda ~20–40s (descarga FIT de Garmin).</>
                ) : (
                  <>
                    Procesando… <strong>{backfill.processed}</strong> actividades revisadas
                  </>
                )}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
                <div className="h-full w-1/3 animate-pulse rounded bg-blue-500" />
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  cancelBackfill.current = true
                }}
              >
                Pausar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => runBackfill(true)} disabled={syncing}>
                Importar todo desde cero
              </Button>
              {(backfill?.status === 'idle' || backfill?.status === 'error') && (backfill?.processed ?? 0) > 0 && (
                <Button variant="secondary" onClick={() => runBackfill(false)} disabled={syncing}>
                  Continuar
                </Button>
              )}
              {backfill?.status === 'done' && (
                <span className="text-xs text-green-700">
                  Historial importado ({backfill.processed} actividades revisadas)
                </span>
              )}
              {backfill?.status === 'error' && (
                <span className="text-xs text-red-700">Error: {backfill.error}</span>
              )}
            </div>
          )}
        </div>

        {error && <Alert variant="error">{error}</Alert>}
      </Card>
    )
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">Garmin Connect</h2>
        <p className="text-sm text-slate-600">
          Conectá tu cuenta de Garmin para sincronizar automáticamente datos de sueño, estrés,
          Body Battery, FC reposo y completar actividades con datos que Strava no tiene.
        </p>
      </div>

      <div className="space-y-2">
        <input
          type="email"
          placeholder="Email de Garmin Connect"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        {needsMfa && (
          <input
            type="text"
            placeholder="Código MFA"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            disabled={busy}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        )}

        <Button onClick={handleConnect} disabled={busy || !email || !password}>
          {busy ? 'Conectando...' : needsMfa ? 'Verificar MFA' : 'Conectar'}
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        Tu contraseña se usa una sola vez para obtener tokens de acceso. No se guarda.
      </p>

      {error && <Alert variant="error">{error}</Alert>}
    </Card>
  )
}

function formatSyncResult(r: SyncResult): string {
  const parts: string[] = []
  if (r.activitiesEnriched > 0) parts.push(`${r.activitiesEnriched} actividades enriquecidas`)
  if (r.activitiesCreated > 0) parts.push(`${r.activitiesCreated} actividades creadas`)
  if (r.samplesAdded > 0) parts.push(`${r.samplesAdded} con muestras por segundo`)
  if (r.healthDaysUpdated > 0) parts.push(`${r.healthDaysUpdated} días de salud actualizados`)
  if (parts.length === 0) return 'Sincronización completa. No se encontraron datos nuevos.'
  return `Sincronización completa: ${parts.join(' · ')}`
}
