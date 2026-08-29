'use client'

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Alert, Button, Card, Input } from '@/components/ui'
import { useRouter } from 'next/navigation'

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
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-slate-200">{children}</thead>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-slate-300 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => <td className="border border-slate-300 px-2 py-1">{children}</td>,
  code: ({ children }: { children?: React.ReactNode }) => {
    const raw = String(children ?? '')
    if (/^\s*\{[\s\S]*"workouts"\s*:/.test(raw)) return null
    return <code className="rounded bg-slate-200 px-1 py-0.5 text-[0.85em]">{children}</code>
  },
}


const SUGGESTIONS = [
  '¿Qué debería entrenar hoy?',
  '¿Cómo viene mi carga esta semana?',
  'Armame un plan para los próximos 7 días',
]

type CoachPlan = {
  emphasis?: 'recovery' | 'maintenance' | 'build'
  workouts: Array<{
    date: string
    type: string
    duration_minutes: number
    title?: string
    target_zone?: string
  }>
}

/**
 * The coach appends a hidden ```plan``` block with the structured version of
 * whatever plan it just showed. Split it out so the athlete only sees the prose
 * and we can offer to save the exact same sessions.
 */
function tryParsePlan(raw: string): CoachPlan | null {
  try {
    const plan = JSON.parse(raw.trim()) as CoachPlan
    if (plan && Array.isArray(plan.workouts) && plan.workouts.length > 0) return plan
  } catch {
    // ignore
  }
  return null
}

function splitPlanBlock(message: string): { text: string; plan: CoachPlan | null } {
  let text = message
  let plan: CoachPlan | null = null

  const fences = Array.from(text.matchAll(/```(?:plan|json)?\s*\n?([\s\S]*?)```/gi))
  for (const match of fences) {
    const parsed = tryParsePlan(match[1])
    if (parsed) plan = parsed
    if (parsed || /"workouts"\s*:/.test(match[1]) || /"emphasis"\s*:/.test(match[1])) {
      text = text.replace(match[0], '')
    }
  }

  const trailing = text.match(/(\{[\s\S]*"workouts"\s*:\s*\[[\s\S]*)$/)
  if (trailing && trailing.index != null) {
    const parsed = tryParsePlan(trailing[1])
    if (parsed) plan = parsed
    text = text.slice(0, trailing.index)
  }

  text = text
    .replace(/```(?:plan|json)?[\s\S]*$/i, '')
    .replace(/\n?\{[\s\S]*"emphasis"[\s\S]*$/, '')
    .trim()

  return { text, plan }
}

export function CoachChat({ initialMessages }: { initialMessages: CoachMessage[] }) {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [proposing, setProposing] = useState(false)
  const [draft, setDraft] = useState<any | null>(null)
  const [rationale, setRationale] = useState<string | null>(null)
  const [commitLoading, setCommitLoading] = useState(false)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setInput(trimmed)
    } finally {
      setSending(false)
    }
  }

  async function proposePlan(plan: CoachPlan) {
    setProposing(true)
    setError(null)
    try {
      const res = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'coach_preview', plan }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'No se pudo generar la propuesta.')
      setDraft(body.draft)
      setRationale(body.rationale ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al generar propuesta.')
    } finally {
      setProposing(false)
    }
  }

  async function commitPlan() {
    if (!draft) return
    setCommitLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/training/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', draft, rationale }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar el plan.')
      setMessages((prev) => [
        ...prev,
        {
          id: `local-plan-${Date.now()}`,
          direction: 'outbound',
          channel: 'web',
          message: `Plan guardado: ${body.created ?? 0} sesiones programadas.`,
          created_at: new Date().toISOString(),
        },
      ])
      setDraft(null)
      setRationale(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al guardar plan.')
    } finally {
      setCommitLoading(false)
    }
  }

  return (
    <Card className="flex h-[60vh] md:h-[70vh] flex-col gap-4 p-4">
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
                    ? 'whitespace-pre-wrap bg-primary text-white'
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
              {/* Only coach messages that carry a structured plan can be saved */}
              {!isUser && plan && (
                <button
                  type="button"
                  onClick={() => proposePlan(plan)}
                  disabled={proposing}
                  className="mt-1 text-xs text-muted underline"
                >
                  {proposing ? 'Generando propuesta…' : 'Convertir a plan'}
                </button>
              )}
            </div>
          )
        })}

        {/* Draft preview / commit panel */}
        {draft && (
          <div className="rounded-lg border border-surface bg-surface p-3 text-sm space-y-2">
            <h3 className="font-semibold">Propuesta de plan</h3>
            {rationale && <p className="text-xs text-muted">{rationale}</p>}
            <div className="mt-2 space-y-1">
              {draft.workouts?.length ? (
                draft.workouts.map((w: any, i: number) => (
                  <div key={`${w.scheduled_date}-${w.workout_type}-${i}`} className="flex justify-between">
                    <div>
                      <div className="font-medium">{w.scheduled_date}</div>
                      <div className="text-xs text-muted">{w.title} — {w.duration_minutes} min</div>
                    </div>
                    <div className="text-sm text-muted">{w.target_zone}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted">No hay sesiones en la propuesta.</div>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={commitPlan} loading={commitLoading} disabled={commitLoading}>
                Guardar plan
              </Button>
              <Button variant="secondary" onClick={() => { setDraft(null); setRationale(null) }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

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
