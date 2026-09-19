'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Card, Field, Input, Select, Spinner } from '@/components/ui'
import { parseFloatOrNull, parseIntOrNull } from '@/lib/utils'
import type { ExperienceLevel, Sex } from '@/lib/types/database'

type FormState = {
  name: string
  username: string
  age: string
  sex: string
  weight: string
  height: string
  experienceLevel: string
  timezone: string
  ftp: string
  maxHr: string
  restingHr: string
}

const EMPTY: FormState = {
  name: '',
  username: '',
  age: '',
  sex: '',
  weight: '',
  height: '',
  experienceLevel: '',
  timezone: '',
  ftp: '',
  maxHr: '',
  restingHr: '',
}

const FALLBACK_ZONES = [
  'UTC',
  'Europe/Madrid',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Sao_Paulo',
]

const ZONE_LABEL: Record<string, string> = {
  'America/Argentina/Buenos_Aires': 'Buenos Aires (Argentina)',
  'America/Argentina/Cordoba': 'Córdoba (Argentina)',
  'America/Argentina/Mendoza': 'Mendoza (Argentina)',
  'America/Argentina/Salta': 'Salta (Argentina)',
  'Europe/Madrid': 'Madrid (España)',
  UTC: 'UTC',
}

const PINNED_ZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
  'Europe/Madrid',
  'UTC',
]

function foldZone(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function zoneLabel(id: string): string {
  return ZONE_LABEL[id] ?? id.replace(/_/g, ' ')
}

function zoneMatches(zone: string, query: string): boolean {
  const q = foldZone(query)
  if (!q) return true
  const hay = `${foldZone(zone)} ${foldZone(zoneLabel(zone))}`
  if (hay.includes(q)) return true
  return q.split(' ').every((token) => token && hay.includes(token))
}

export function ProfileForm() {
  const supabase = createClient()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tzQuery, setTzQuery] = useState('')

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }, [])

  const timeZones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    const list = supported.length > 0 ? supported : FALLBACK_ZONES
    const all = Array.from(new Set([detected, ...PINNED_ZONES, ...list].filter(Boolean)))
    const visible = tzQuery.trim()
      ? all.filter((zone) => zoneMatches(zone, tzQuery))
      : all
    const pinned = PINNED_ZONES.filter((zone) => visible.includes(zone))
    const rest = visible.filter((zone) => !PINNED_ZONES.includes(zone))
    return [...pinned, ...rest]
  }, [tzQuery])

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

        const profile = profileResult.data as any
        const metrics = metricsResult.data

        setForm({
          name: profile?.name ?? '',
          username: profile?.username ?? '',
          age: profile?.age?.toString() ?? '',
          sex: profile?.sex ?? '',
          weight: profile?.weight_kg?.toString() ?? '',
          height: profile?.height_cm?.toString() ?? '',
          experienceLevel: profile?.experience_level ?? '',
          timezone:
            profile?.timezone && profile.timezone !== 'UTC'
              ? profile.timezone
              : Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    // basic validation for username: lowercase letters, numbers, underscores
    if (form.username && !/^[a-z0-9_]+$/.test(form.username)) {
      setError('El nombre de usuario solo puede contener letras minúsculas, números y guiones bajos.')
      return
    }
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const { error: profileError } = await supabase
        .from('users')
        // cast update payload to any because generated DB types may not include the
        // newly-added `username` column until types are refreshed.
        .update({
          name: form.name.trim() || null,
          username: form.username ? form.username.toLowerCase() : null,
          age: parseIntOrNull(form.age),
          sex: (form.sex || null) as Sex | null,
          weight_kg: parseFloatOrNull(form.weight),
          height_cm: parseFloatOrNull(form.height),
          experience_level: (form.experienceLevel || null) as ExperienceLevel | null,
          timezone: form.timezone || 'UTC',
        } as any)
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

          <Field label="Nombre de usuario" hint="Solo letras minúsculas, números y guiones bajos.">
            <Input value={form.username} onChange={(e) => set('username', e.target.value)} />
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

          <Field
            label="Zona horaria"
            className="sm:col-span-2"
            hint="Si no la ves, buscá «Buenos Aires» o «Argentina»."
          >
            <Input
              value={tzQuery}
              onChange={(e) => setTzQuery(e.target.value)}
              placeholder="Buscar: Buenos Aires, Argentina, Madrid…"
              className="mb-2"
            />
            <Select value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {form.timezone && !timeZones.includes(form.timezone) && (
                <option value={form.timezone}>{zoneLabel(form.timezone)}</option>
              )}
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zoneLabel(zone)}
                </option>
              ))}
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
