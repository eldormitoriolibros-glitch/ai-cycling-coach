'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Alert, Button } from '@/components/ui'

export function SyncUnsyncedButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSync = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/activities/sync-unsynced', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setMessage(
          data.processed > 0
            ? `✓ Sincronizadas ${data.processed} actividades. ${data.remaining > 0 ? `Quedan ${data.remaining} por sincronizar.` : 'Todas sincronizadas!'}`
            : data.message
        )
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (err) {
      setMessage('Error al sincronizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleSync} loading={loading} variant="secondary">
        {!loading && <RefreshCw aria-hidden className="h-4 w-4" />}
        {loading ? 'Sincronizando…' : 'Sincronizar actividades sin datos'}
      </Button>
      {message && (
        <Alert variant={message.includes('Error') ? 'error' : 'success'}>{message}</Alert>
      )}
    </div>
  )
}
