'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

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
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
      >
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Sincronizando...' : 'Sincronizar actividades sin datos'}
      </button>
      {message && (
        <div className={`text-sm ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
