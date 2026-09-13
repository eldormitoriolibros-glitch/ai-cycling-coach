'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Field, Input, Spinner } from '@/components/ui'
import {
  BODY_FEEL,
  MOOD,
  bodyFeelFromSoreness,
  moodFromMotivation,
  motivationFromMood,
  sorenessFromBody,
  type BodyFeelId,
  type MoodId,
} from '@/lib/training/check-in'
import { parseFloatOrNull, parseIntOrNull } from '@/lib/utils'
import { cn } from '@/lib/utils'

export type CheckInValues = {
  sleepHours: number | null
  sleepScore: number | null
  restingHr: number | null
  hrv: number | null
  soreness: number | null
  motivation: number | null
}

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition',
        selected
          ? 'bg-accent-600 text-white shadow-sm shadow-accent-600/20'
          : 'border border-surface bg-background text-muted hover:border-accent-500/40 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

export function MorningCheckIn({
  today,
  compact = false,
  initial,
}: {
  today: string
  compact?: boolean
  initial?: CheckInValues
}) {
  const router = useRouter()
  const supabase = createClient()
  const [date, setDate] = useState(today)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  const [sleepHours, setSleepHours] = useState<number | null>(initial?.sleepHours ?? null)
  const [body, setBody] = useState<BodyFeelId | null>(bodyFeelFromSoreness(initial?.soreness))
  const [mood, setMood] = useState<MoodId | null>(moodFromMotivation(initial?.motivation))
  const [sleepScore, setSleepScore] = useState(initial?.sleepScore?.toString() ?? '')
  const [restingHr, setRestingHr] = useState(initial?.restingHr?.toString() ?? '')
  const [hrv, setHrv] = useState(initial?.hrv?.toString() ?? '')

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Sesión no encontrada. Iniciá sesión de nuevo.')
        if (cancelled) return
        setUserId(user.id)

        const [sleepResult, recoveryResult] = await Promise.all([
          supabase
            .from('sleep')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', date)
            .eq('source', 'manual')
            .maybeSingle(),
          supabase
            .from('recovery_metrics')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', date)
            .eq('source', 'manual')
            .maybeSingle(),
        ])

        if (sleepResult.error) throw sleepResult.error
        if (recoveryResult.error) throw recoveryResult.error
        if (cancelled) return

        const sleep = sleepResult.data
        const recovery = recoveryResult.data
        setSleepHours(sleep?.duration_minutes != null ? sleep.duration_minutes / 60 : null)
        setSleepScore(sleep?.sleep_score?.toString() ?? '')
        setRestingHr(recovery?.resting_hr?.toString() ?? '')
        setHrv(recovery?.hrv?.toString() ?? '')
        setBody(bodyFeelFromSoreness(recovery?.soreness))
        setMood(moodFromMotivation(recovery?.motivation))
        setSuccess(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el día.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, date])

  useEffect(() => {
    if (loading || compact) return
    if (typeof window === 'undefined' || window.location.hash !== '#cargar') return
    document.getElementById('sleep-hours')?.focus()
  }, [loading, compact])

  const nudgeHours = (delta: number) => {
    setSuccess(null)
    setSleepHours((prev) => {
      const base = prev ?? 7
      return Math.min(16, Math.max(0, Math.round((base + delta) * 2) / 2))
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || saving) return

    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const hours = sleepHours
      const [sleepResult, recoveryResult] = await Promise.all([
        supabase.from('sleep').upsert(
          {
            user_id: userId,
            date,
            source: 'manual',
            duration_minutes: hours == null ? null : Math.round(hours * 60),
            sleep_score: parseIntOrNull(sleepScore),
          },
          { onConflict: 'user_id,date,source' }
        ),
        supabase.from('recovery_metrics').upsert(
          {
            user_id: userId,
            date,
            source: 'manual',
            resting_hr: parseIntOrNull(restingHr),
            hrv: parseFloatOrNull(hrv),
            soreness: sorenessFromBody(body),
            motivation: motivationFromMood(mood),
          },
          { onConflict: 'user_id,date,source' }
        ),
      ])

      if (sleepResult.error) throw sleepResult.error
      if (recoveryResult.error) throw recoveryResult.error

      const hoursLabel = hours != null ? `${hours.toFixed(1)} h` : 'listo'
      setSuccess(`Guardado: ${hoursLabel}.`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = sleepHours != null || body != null || mood != null

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!compact && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Otra fecha</summary>
          <div className="mt-2">
            <Field label="Fecha">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="sm:w-48" />
            </Field>
          </div>
        </details>
      )}

      {loading ? (
        <Spinner label="Cargando el día…" />
      ) : (
        <>
          <div>
            <p className="mb-2 text-sm font-medium">Horas de sueño</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => nudgeHours(-0.5)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-surface bg-background text-foreground hover:border-accent-500/40"
                aria-label="Restar media hora"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                id="sleep-hours"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                max={16}
                value={sleepHours ?? ''}
                placeholder="7.5"
                onChange={(e) => {
                  setSuccess(null)
                  setSleepHours(parseFloatOrNull(e.target.value))
                }}
                className="w-20 border-0 bg-transparent text-center text-2xl font-bold tabular-nums text-foreground outline-none"
              />
              <span className="text-sm text-muted">h</span>
              <button
                type="button"
                onClick={() => nudgeHours(0.5)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-surface bg-background text-foreground hover:border-accent-500/40"
                aria-label="Sumar media hora"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">El cuerpo</p>
            <div className="flex flex-wrap gap-2">
              {BODY_FEEL.map((option) => (
                <Chip
                  key={option.id}
                  selected={body === option.id}
                  onClick={() => {
                    setSuccess(null)
                    setBody((prev) => (prev === option.id ? null : option.id))
                  }}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Ganas</p>
            <div className="flex flex-wrap gap-2">
              {MOOD.map((option) => (
                <Chip
                  key={option.id}
                  selected={mood === option.id}
                  onClick={() => {
                    setSuccess(null)
                    setMood((prev) => (prev === option.id ? null : option.id))
                  }}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="text-xs font-medium text-accent-600 dark:text-accent-400"
            >
              {more ? 'Ocultar más datos' : 'Más datos (calidad, pulso, HRV)'}
            </button>
            {more && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Calidad (0–100)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={sleepScore}
                    onChange={(e) => {
                      setSuccess(null)
                      setSleepScore(e.target.value)
                    }}
                  />
                </Field>
                <Field label="FC reposo">
                  <Input
                    type="number"
                    min={25}
                    max={120}
                    value={restingHr}
                    onChange={(e) => {
                      setSuccess(null)
                      setRestingHr(e.target.value)
                    }}
                  />
                </Field>
                <Field label="HRV (ms)">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    value={hrv}
                    onChange={(e) => {
                      setSuccess(null)
                      setHrv(e.target.value)
                    }}
                  />
                </Field>
              </div>
            )}
          </div>
        </>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Button type="submit" loading={saving} disabled={!userId || loading || !canSave}>
        Guardar
      </Button>
    </form>
  )
}
