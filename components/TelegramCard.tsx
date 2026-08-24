'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2Off, MessageCircle } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'

export function TelegramCard({
  configured,
  linked,
  botUsername,
}: {
  configured: boolean
  linked: boolean
  botUsername: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<'link' | 'unlink' | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setBusy('link')
    setError(null)
    try {
      const response = await fetch('/api/telegram/link', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'No se pudo generar el código.')
      setCode(body.code)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setBusy(null)
    }
  }

  const unlink = async () => {
    setBusy('unlink')
    setError(null)
    try {
      const response = await fetch('/api/telegram/link', { method: 'DELETE' })
      if (!response.ok) throw new Error('No se pudo desvincular.')
      setCode(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold">Telegram</h2>
          <p className="text-sm text-slate-600">
            Hablá con el entrenador desde el celular, sin abrir la web.
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            linked ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {linked ? 'vinculado' : 'sin vincular'}
        </span>
      </div>

      {!configured && (
        <Alert variant="info">
          Falta configurar <code>TELEGRAM_BOT_TOKEN</code> y <code>TELEGRAM_WEBHOOK_SECRET</code> en{' '}
          <code>.env.local</code>. Creá el bot escribiéndole a @BotFather.
        </Alert>
      )}

      {code && (
        <Alert variant="success">
          Abrí el chat {botUsername ? `con @${botUsername}` : 'del bot'} y enviá:{' '}
          <code className="font-mono font-semibold">/vincular {code}</code>
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={generate} loading={busy === 'link'} disabled={!configured || busy !== null}>
          <MessageCircle aria-hidden className="h-4 w-4" />
          {linked ? 'Generar código nuevo' : 'Vincular Telegram'}
        </Button>
        {linked && (
          <Button
            variant="danger"
            onClick={unlink}
            loading={busy === 'unlink'}
            disabled={busy !== null}
          >
            <Link2Off aria-hidden className="h-4 w-4" />
            Desvincular
          </Button>
        )}
      </div>
    </Card>
  )
}
