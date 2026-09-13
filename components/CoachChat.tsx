'use client'

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Alert, Button, Card, Input } from '@/components/ui'
import { useRouter } from 'next/navigation'
import { normalizeCoachPlan, splitPlanBlock, type CoachPlan } from '@/lib/training/coach-plan'

export type CoachMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  channel: string
  message: string
  created_at: string
}

/** Tailwind styling for the coach's markdown replies (tables, bold, lists). */
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 font-semibold">{children}</h3>,
  h2: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 font-semibold">{children}</h3>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 font-semibold">{children}</h3>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-background">{children}</thead>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-surface px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => <td className="border border-surface px-2 py-1">{children}</td>,
  code: ({ children }: { children?: React.ReactNode }) => {
    const raw = String(children ?? '')
    if (/^\s*\{[\s\S]*"workouts"\s*:/.test(raw)) return null
    return <code className="rounded bg-background px-1 py-0.5 text-[0.85em]">{children}</code>
  },
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
  const [proposing, setProposing] = useState(false)
  const [savedPlanKey, setSavedPlanKey] = useState<string | null>(null)
  const router = useRouter()

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
      if (typeof body.reply === 'string' && /Cambio confirmado/.test(body.reply)) {
        router.push('/plan')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setInput(trimmed)
    } finally {
      setSending(false)
    }
  }

  async function savePlan(plan: CoachPlan) {
    const normalized = normalizeCoachPlan(plan)
    if (!normalized) {
      setError('El entrenador no mandó fechas válidas. Pedile de nuevo el plan de hoy.')
      return
    }

    setProposing(true)
    setError(null)
    try {
      const previewRes = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'coach_preview', plan: normalized }),
      })
      const preview = await previewRes.json().catch(() => ({}))
      if (!previewRes.ok) throw new Error(preview.error ?? 'No se pudo armar el plan.')
      if (!preview.draft?.workouts?.length) {
        throw new Error('El plan no tiene sesiones para guardar. Pedile al entrenador que lo repita.')
      }

      const commitRes = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          draft: preview.draft,
          rationale: preview.rationale ?? null,
        }),
      })
      const committed = await commitRes.json().catch(() => ({}))
      if (!commitRes.ok) throw new Error(committed.error ?? 'No se pudo guardar el plan.')
      if (!committed.created) {
        throw new Error('No se guardó ninguna sesión. Pedile al entrenador que lo vuelva a mandar.')
      }

      setSavedPlanKey(planKey(normalized))
      setMessages((prev) => [
        ...prev,
        {
          id: `local-plan-${Date.now()}`,
          direction: 'outbound',
          channel: 'web',
          message: `Listo: ${committed.created} sesión${committed.created === 1 ? '' : 'es'} agendada${committed.created === 1 ? '' : 's'} en tu plan.`,
          created_at: new Date().toISOString(),
        },
      ])
      router.push('/plan')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al guardar el plan.')
    } finally {
      setProposing(false)
    }
  }

  function planKey(plan: CoachPlan): string {
    return plan.workouts.map((w) => `${w.date}:${w.type}:${w.duration_minutes}`).join('|')
  }

  return (
    <Card className="flex h-[60vh] md:h-[70vh] flex-col gap-4 p-4">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted">Preguntale lo que quieras sobre tu entrenamiento.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-surface px-3 py-1 text-xs text-muted hover:bg-background hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.direction === 'inbound'
          const { text, plan } = isUser
            ? { text: message.message, plan: null }
            : splitPlanBlock(message.message)
          return (
            <div key={message.id} className={isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
              <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-3 py-2 text-sm break-words ${
                  isUser
                    ? 'whitespace-pre-wrap bg-accent-600 text-white'
                    : 'bg-surface text-muted'
                }`}
                style={isUser ? { boxShadow: '0 2px 6px rgba(0,0,0,0.3)' } : undefined}
              >
                {isUser ? (
                  text
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {text}
                  </ReactMarkdown>
                )}
              {message.channel === 'telegram' && (
                <span className="mt-1 block text-[10px] opacity-60">vía Telegram</span>
              )}
              </div>
              {!isUser && plan && (
                savedPlanKey === planKey(plan) ? (
                  <p className="mt-1 text-xs text-accent-600 dark:text-accent-400">Agendado en tu plan</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => savePlan(plan)}
                    disabled={proposing}
                    className="mt-1 text-xs font-medium text-accent-600 underline dark:text-accent-400"
                  >
                    {proposing ? 'Agendando…' : 'Confirmar y agendar'}
                  </button>
                )
              )}
            </div>
          )
        })}

        {sending && <p className="text-xs text-muted">El entrenador está pensando…</p>}
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
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu pregunta…"
          maxLength={2000}
          className="flex-1"
        />
        <Button type="submit" loading={sending} disabled={!input.trim()}>
          <Send aria-hidden className="h-4 w-4" />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </Card>
  )
}
