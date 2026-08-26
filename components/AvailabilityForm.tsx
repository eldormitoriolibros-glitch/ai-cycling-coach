'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Card, Input, Spinner } from '@/components/ui'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type Row = {
  day_of_week: number
  bike_hours: number
  strength_hours: number
}

const defaultRows = (): Row[] =>
  Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, bike_hours: 0, strength_hours: 0 }))

/** DB stores minutes; the form works in hours since that's how the athlete thinks about it. */
const minutesToHours = (minutes: number) => Math.round((minutes / 60) * 4) / 4 // nearest quarter hour

export function AvailabilityForm() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>(defaultRows)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

        const { data, error: fetchError } = await supabase
          .from('availability')
          .select('*')
          .eq('user_id', user.id)
        if (fetchError) throw fetchError
        if (cancelled || !data?.length) return

        const byDay = new Map(data.map((d) => [d.day_of_week, d]))
        setRows(
          defaultRows().map((row) => {
            const saved = byDay.get(row.day_of_week)
            if (!saved) return row
            return {
              day_of_week: saved.day_of_week,
              bike_hours: minutesToHours(saved.bike_minutes),
              strength_hours: minutesToHours(saved.strength_minutes),
            }
          })
        )
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la disponibilidad.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase])

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || saving) return

    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const { error: saveError } = await supabase.from('availability').upsert(
        rows.map((r) => ({
          user_id: userId,
          day_of_week: r.day_of_week,
          bike_minutes: Math.round(r.bike_hours * 60),
          strength_minutes: Math.round(r.strength_hours * 60),
        })),
        { onConflict: 'user_id,day_of_week' }
      )
      if (saveError) throw saveError

      setSuccess('Disponibilidad guardada.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la disponibilidad.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <Spinner label="Cargando disponibilidad…" />
      </Card>
    )
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-slate-600">
        Cargá cuántas horas tenés por día para bici y, si corresponde, para fuerza. Vos manejás los horarios; la app
        solo necesita saber cuánto tiempo tiene disponible para planificar.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {rows.map((row, i) => (
          <fieldset
            key={row.day_of_week}
            className="grid grid-cols-1 gap-3 border-b border-slate-100 pb-4 last:border-0 sm:grid-cols-3 sm:items-end"
          >
            <span className="font-medium">{DAYS[row.day_of_week]}</span>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Horas de bici</span>
              <Input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={row.bike_hours}
                onChange={(e) => updateRow(i, { bike_hours: Number.parseFloat(e.target.value) || 0 })}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Horas de fuerza (opcional)</span>
              <Input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={row.strength_hours}
                onChange={(e) => updateRow(i, { strength_hours: Number.parseFloat(e.target.value) || 0 })}
              />
            </label>
          </fieldset>
        ))}

        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Button type="submit" loading={saving} disabled={!userId}>
          Guardar disponibilidad
        </Button>
      </form>
    </Card>
  )
}
