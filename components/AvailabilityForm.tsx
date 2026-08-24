'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Card, Input, Spinner } from '@/components/ui'
import { toPgTime, toTimeInput } from '@/lib/utils'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type Row = {
  day_of_week: number
  available: boolean
  start_time: string
  end_time: string
  max_duration_minutes: number
}

const defaultRows = (): Row[] =>
  Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    available: false,
    start_time: '08:00',
    end_time: '09:00',
    max_duration_minutes: 60,
  }))

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
              available: saved.available,
              start_time: toTimeInput(saved.start_time, row.start_time),
              end_time: toTimeInput(saved.end_time, row.end_time),
              max_duration_minutes: saved.max_duration_minutes,
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

    // Mirrors the availability_window_valid CHECK constraint.
    const invalid = rows.find((r) => r.end_time <= r.start_time)
    if (invalid) {
      setError(`${DAYS[invalid.day_of_week]}: la hora de fin debe ser posterior a la de inicio.`)
      return
    }

    setSaving(true)
    try {
      const { error: saveError } = await supabase.from('availability').upsert(
        rows.map((r) => ({
          user_id: userId,
          day_of_week: r.day_of_week,
          available: r.available,
          start_time: toPgTime(r.start_time),
          end_time: toPgTime(r.end_time),
          max_duration_minutes: r.max_duration_minutes,
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {rows.map((row, i) => (
          <fieldset
            key={row.day_of_week}
            className="grid grid-cols-1 gap-3 border-b border-slate-100 pb-4 last:border-0 sm:grid-cols-4 sm:items-end"
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={row.available}
                onChange={(e) => updateRow(i, { available: e.target.checked })}
              />
              <span className="font-medium">{DAYS[row.day_of_week]}</span>
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Desde</span>
              <Input
                type="time"
                value={row.start_time}
                disabled={!row.available}
                onChange={(e) => updateRow(i, { start_time: e.target.value })}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Hasta</span>
              <Input
                type="time"
                value={row.end_time}
                disabled={!row.available}
                onChange={(e) => updateRow(i, { end_time: e.target.value })}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Duración máx (min)</span>
              <Input
                type="number"
                min={0}
                max={1440}
                step={5}
                value={row.max_duration_minutes}
                disabled={!row.available}
                onChange={(e) =>
                  updateRow(i, { max_duration_minutes: Number.parseInt(e.target.value, 10) || 0 })
                }
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
