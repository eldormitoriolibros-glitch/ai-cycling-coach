'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, RefreshCw, Unlink } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'

type Props = {
  connected: boolean
  athleteId: number | null
  lastSyncAt: string | null
  lastSyncError: string | null
  status: string | null
  initialMessage?: { variant: 'error' | 'success' | 'info'; text: string } | null
}

export function StravaCard({
  connected,
  athleteId,
  lastSyncAt,
  lastSyncError,
  status,
  initialMessage = null,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'sync' | 'resync' | 'disconnect' | null>(null)
  const [message, setMessage] = useState(initialMessage)

  const call = async (action: 'sync' | 'resync' | 'disconnect') => {
    setBusy(action)
    setMessage(null)
    try {
      const endpoint = action === 'disconnect' ? 'disconnect' : 'sync'
      const response = await fetch(`/api/strava/${endpoint}`, {
        method: 'POST',
        // ensure same-site cookies are sent so the server can authenticate the user
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full: action === 'resync' }),
      })
      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body.error ?? 'La operación falló.')
      }

      setMessage({
        variant: 'success',
        text:
          action === 'disconnect'
            ? 'Strava desconectado.'
            : [
                `${action === 'resync' ? 'Resincronización' : 'Sincronización'} completa: ${body.synced ?? 0} actividades.`,
                body.streamsProcessed ? `Potencia procesada en ${body.streamsProcessed}.` : '',
                body.streamsRemaining
                  ? `Faltan ${body.streamsRemaining} — volvé a sincronizar en 15 min.`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
      })
      router.refresh()
    } catch (err) {
      setMessage({ variant: 'error', text: err instanceof Error ? err.message : 'Error inesperado.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold">Strava</h2>
          <p className="text-sm text-slate-600">
            {connected
              ? `Conectado${athleteId ? ` (atleta ${athleteId})` : ''}.`
              : 'Sincronizá automáticamente tus salidas.'}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            connected ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {connected ? (status ?? 'connected') : 'sin conectar'}
        </span>
      </div>

      {connected && (
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          <dt className="font-medium text-slate-700">Última sincronización</dt>
          <dd>{lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-AR') : 'Nunca'}</dd>
        </dl>
      )}

      {lastSyncError && <Alert variant="error">{lastSyncError}</Alert>}
      {message && <Alert variant={message.variant}>{message.text}</Alert>}

      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            <Button onClick={() => call('sync')} loading={busy === 'sync'} disabled={busy !== null}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              Sincronizar ahora
            </Button>
            <Button
              variant="secondary"
              onClick={() => call('resync')}
              loading={busy === 'resync'}
              disabled={busy !== null}
              title="Vuelve a leer los últimos 180 días desde cero. Usalo después de cambiar la privacidad en Strava."
            >
              <History aria-hidden className="h-4 w-4" />
              Resincronizar todo
            </Button>
            <Button
              variant="danger"
              onClick={() => call('disconnect')}
              loading={busy === 'disconnect'}
              disabled={busy !== null}
            >
              <Unlink aria-hidden className="h-4 w-4" />
              Desconectar
            </Button>
          </>
        ) : (
          // Full page navigation: the OAuth redirect must leave the SPA.
          <Button onClick={() => window.location.assign('/api/strava/connect')}>
            Conectar con Strava
          </Button>
        )}
      </div>
    </Card>
  )
}
