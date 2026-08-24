'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Card, Field, Input, Select, Spinner } from '@/components/ui'
import { parseFloatOrNull, parseIntOrNull } from '@/lib/utils'
import type { ExperienceLevel, Sex } from '@/lib/types/database'

type FormState = {
  name: string
  age: string
  sex: string
  weight: string
  height: string
  experienceLevel: string
  ftp: string
  maxHr: string
  restingHr: string
}

const EMPTY: FormState = {
  name: '',
  age: '',
  sex: '',
  weight: '',
  height: '',
  experienceLevel: '',
  ftp: '',
  maxHr: '',
  restingHr: '',
}

export function ProfileForm() {
  const supabase = createClient()
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

    ;(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Sesión no encontrada. Iniciá sesión de nuevo.')
        if (cancelled) return
        setUserId(user.id)

        const [profileResult, metricsResult] = await Promise.all([
          supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('athlete_metrics').select('*').eq('user_id', user.id).maybeSingle(),
        ])

        if (profileResult.error) throw profileResult.error
        if (metricsResult.error) throw metricsResult.error
        if (cancelled) return

        const profile = profileResult.data
        const metrics = metricsResult.data

        setForm({
          name: profile?.name ?? '',
          age: profile?.age?.toString() ?? '',
          sex: profile?.sex ?? '',
          weight: profile?.weight_kg?.toString() ?? '',
          height: profile?.height_cm?.toString() ?? '',
          experienceLevel: profile?.experience_level ?? '',
          ftp: metrics?.ftp?.toString() ?? '',
          maxHr: metrics?.max_hr?.toString() ?? '',
          restingHr: metrics?.resting_hr?.toString() ?? '',
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || saving) return

    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          name: form.name.trim() || null,
          age: parseIntOrNull(form.age),
          sex: (form.sex || null) as Sex | null,
          weight_kg: parseFloatOrNull(form.weight),
          height_cm: parseFloatOrNull(form.height),
          experience_level: (form.experienceLevel || null) as ExperienceLevel | null,
        })
        .eq('id', userId)
      if (profileError) throw profileError

      const { error: metricsError } = await supabase.from('athlete_metrics').upsert(
        {
          user_id: userId,
          ftp: parseIntOrNull(form.ftp),
          max_hr: parseIntOrNull(form.maxHr),
          resting_hr: parseIntOrNull(form.restingHr),
        },
        { onConflict: 'user_id' }
      )
      if (metricsError) throw metricsError

      // FTP and heart rates feed every stress estimate, so redo the history.
      const recompute = await fetch('/api/training/recompute', { method: 'POST' })
      const body = await recompute.json().catch(() => ({}))

      setSuccess(
        recompute.ok && body.activitiesUpdated
          ? `Perfil guardado. Se recalculó la carga de ${body.activitiesUpdated} actividades.`
          : 'Perfil guardado.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <Spinner label="Cargando perfil…" />
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <Field label="Edad">
            <Input
              type="number"
              min={10}
              max={120}
              value={form.age}
              onChange={(e) => set('age', e.target.value)}
            />
          </Field>

          <Field label="Sexo">
            <Select value={form.sex} onChange={(e) => set('sex', e.target.value)}>
              <option value="">Sin especificar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
              <option value="other">Otro</option>
            </Select>
          </Field>

          <Field label="Peso (kg)">
            <Input
              type="number"
              step="0.1"
              min={20}
              value={form.weight}
              onChange={(e) => set('weight', e.target.value)}
            />
          </Field>

          <Field label="Altura (cm)">
            <Input
              type="number"
              step="0.5"
              min={100}
              value={form.height}
              onChange={(e) => set('height', e.target.value)}
            />
          </Field>

          <Field label="Nivel de experiencia" className="sm:col-span-2">
            <Select
              value={form.experienceLevel}
              onChange={(e) => set('experienceLevel', e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="beginner">Principiante</option>
              <option value="intermediate">Intermedio</option>
              <option value="advanced">Avanzado</option>
            </Select>
          </Field>

          <Field label="FTP (W)" hint="Potencia umbral funcional.">
            <Input
              type="number"
              min={50}
              max={700}
              value={form.ftp}
              onChange={(e) => set('ftp', e.target.value)}
            />
          </Field>

          <Field label="FC máxima (ppm)">
            <Input
              type="number"
              min={100}
              max={250}
              value={form.maxHr}
              onChange={(e) => set('maxHr', e.target.value)}
            />
          </Field>

          <Field label="FC en reposo (ppm)">
            <Input
              type="number"
              min={25}
              max={120}
              value={form.restingHr}
              onChange={(e) => set('restingHr', e.target.value)}
            />
          </Field>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Button type="submit" loading={saving} disabled={!userId}>
          Guardar perfil
        </Button>
      </form>
    </Card>
  )
}
