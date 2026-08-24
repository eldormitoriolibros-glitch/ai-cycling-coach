'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui'
import { parseFloatOrNull, parseIntOrNull } from '@/lib/utils'

type FormState = {
  sleepHours: string
  sleepScore: string
  restingHr: string
  hrv: string
  soreness: string
  motivation: string
}

const EMPTY: FormState = {
  sleepHours: '',
  sleepScore: '',
  restingHr: '',
  hrv: '',
  soreness: '',
  motivation: '',
}

export function RecoveryForm({ today }: { today: string }) {
  const supabase = createClient()
  const [date, setDate] = useState(today)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }, [])

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

        setForm({
          sleepHours: sleep?.duration_minutes ? (sleep.duration_minutes / 60).toFixed(1) : '',
          sleepScore: sleep?.sleep_score?.toString() ?? '',
          restingHr: recovery?.resting_hr?.toString() ?? '',
          hrv: recovery?.hrv?.toString() ?? '',
          soreness: recovery?.soreness?.toString() ?? '',
          motivation: recovery?.motivation?.toString() ?? '',
        })
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || saving) return

    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const hours = parseFloatOrNull(form.sleepHours)

      const [sleepResult, recoveryResult] = await Promise.all([
        supabase.from('sleep').upsert(
          {
            user_id: userId,
            date,
            source: 'manual',
            duration_minutes: hours === null ? null : Math.round(hours * 60),
            sleep_score: parseIntOrNull(form.sleepScore),
          },
          { onConflict: 'user_id,date,source' }
        ),
        supabase.from('recovery_metrics').upsert(
          {
            user_id: userId,
            date,
            source: 'manual',
            resting_hr: parseIntOrNull(form.restingHr),
            hrv: parseFloatOrNull(form.hrv),
            soreness: parseIntOrNull(form.soreness),
            motivation: parseIntOrNull(form.motivation),
          },
          { onConflict: 'user_id,date,source' }
        ),
      ])

      if (sleepResult.error) throw sleepResult.error
      if (recoveryResult.error) throw recoveryResult.error

      setSuccess('Registro guardado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Fecha">
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="sm:w-48"
          />
        </Field>

        {loading ? (
          <Spinner label="Cargando el día…" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Horas de sueño">
              <Input
                type="number"
                step="0.5"
                min={0}
                max={16}
                value={form.sleepHours}
                onChange={(e) => set('sleepHours', e.target.value)}
              />
            </Field>

            <Field label="Calidad del sueño (0–100)">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.sleepScore}
                onChange={(e) => set('sleepScore', e.target.value)}
              />
            </Field>

            <Field label="FC en reposo (ppm)" hint="Tomada al despertar, antes de levantarte.">
              <Input
                type="number"
                min={25}
                max={120}
                value={form.restingHr}
                onChange={(e) => set('restingHr', e.target.value)}
              />
            </Field>

            <Field label="HRV (ms)" hint="Si tu reloj o app la mide.">
              <Input
                type="number"
                step="0.1"
                min={0}
                value={form.hrv}
                onChange={(e) => set('hrv', e.target.value)}
              />
            </Field>

            <Field label="Dolor muscular (1–10)" hint="1 = fresco, 10 = destruido.">
              <Input
                type="number"
                min={1}
                max={10}
                value={form.soreness}
                onChange={(e) => set('soreness', e.target.value)}
              />
            </Field>

            <Field label="Ganas de entrenar (1–10)" hint="1 = ninguna, 10 = a full.">
              <Input
                type="number"
                min={1}
                max={10}
                value={form.motivation}
                onChange={(e) => set('motivation', e.target.value)}
              />
            </Field>
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Button type="submit" loading={saving} disabled={!userId || loading}>
          Guardar registro
        </Button>
      </form>
    </Card>
  )
}
