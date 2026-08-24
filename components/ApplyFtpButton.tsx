'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { Alert, Button } from '@/components/ui'

export function ApplyFtpButton({ ftp, currentFtp }: { ftp: number; currentFtp: number | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ variant: 'error' | 'success'; text: string } | null>(null)

  const apply = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/training/ftp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ftp }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'No se pudo aplicar.')

      setMessage({
        variant: 'success',
        text: `FTP actualizado a ${body.ftp} W. Se recalculó la carga de ${body.activitiesUpdated} actividades.`,
      })
      router.refresh()
    } catch (err) {
      setMessage({ variant: 'error', text: err instanceof Error ? err.message : 'Error inesperado.' })
    } finally {
      setBusy(false)
    }
  }

  if (currentFtp === ftp) {
    return <p className="text-sm text-slate-500">Tu FTP actual ya coincide con la estimación.</p>
  }

  return (
    <div className="space-y-2">
      <Button onClick={apply} loading={busy}>
        <Zap aria-hidden className="h-4 w-4" />
        Usar {ftp} W como FTP
      </Button>
      {message && <Alert variant={message.variant}>{message.text}</Alert>}
    </div>
  )
}
