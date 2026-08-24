'use client'

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Alert, Button, Card } from '@/components/ui'

export type CoachMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  channel: string
  message: string
  created_at: string
}

const SUGGESTIONS = [
  '¿Qué debería entrenar hoy?',
  '¿Cómo viene mi carga esta semana?',
  'Armame un plan para los próximos 7 días',
]

export function CoachChat({ initialMessages }: { initialMessages: CoachMessage[] }) {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setError(null)
    setSending(true)
    setInput('')

    const optimistic: CoachMessage = {
      id: `local-${Date.now()}`,
      direction: 'inbound',
      channel: 'web',
      message: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'El entrenador no pudo responder.')

      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-reply`,
          direction: 'outbound',
          channel: 'web',
          message: body.reply,
          created_at: new Date().toISOString(),
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setInput(trimmed)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="flex h-[70vh] flex-col gap-4 p-4">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-slate-500">Preguntale lo que quieras sobre tu entrenamiento.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.direction === 'inbound' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                message.direction === 'inbound'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {message.message}
              {message.channel === 'telegram' && (
                <span className="mt-1 block text-[10px] opacity-60">vía Telegram</span>
              )}
            </div>
          </div>
        ))}

        {sending && <p className="text-xs text-slate-400">El entrenador está pensando…</p>}
        <div ref={endRef} />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu pregunta…"
          maxLength={2000}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        <Button type="submit" loading={sending} disabled={!input.trim()}>
          <Send aria-hidden className="h-4 w-4" />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </Card>
  )
}
