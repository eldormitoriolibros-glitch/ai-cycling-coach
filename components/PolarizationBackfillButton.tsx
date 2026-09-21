'use client'

import { useState } from 'react'
import { PieChart } from 'lucide-react'
import { Alert, Button } from '@/components/ui'

const MAX_BATCHES = 60

type Report = { tone: 'success' | 'info' | 'error'; text: string }

export function PolarizationBackfillButton() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const handleBackfill = async () => {
    setLoading(true)
    setReport(null)

    let judged = 0
    let blocked: string | null = null
    let remaining = 0

    try {
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const res = await fetch('/api/training/polarization/backfill', { method: 'POST' })
        const data = await res.json()

        if (!res.ok) {
          setReport({ tone: 'error', text: `Error: ${data.error}` })
          return
        }

        judged += data.judged
        blocked = data.blocked
        remaining = data.remaining
        setReport({
          tone: 'info',
          text: `Analizando… ${judged} salidas revisadas, quedan ${remaining}.`,
        })

        if (remaining === 0 || data.judged === 0) break
      }

      if (judged > 0) {
        setReport({
          tone: 'success',
          text: `✓ Listo: ${judged} salidas revisadas. El 80/20 aparece en los gráficos de carga.`,
        })
      } else if (blocked === 'no-anchor') {
        setReport({
          tone: 'info',
          text: 'Falta FC máx o FTP: cargá uno en Perfil. Con el pulso alcanza.',
        })
      } else if (blocked === 'no-samples') {
        setReport({
          tone: 'info',
          text: `Hay ${remaining} salidas sin datos segundo a segundo. Usá «Rellenar datos faltantes» primero.`,
        })
      } else {
        setReport({ tone: 'info', text: 'Ya estaban todas revisadas. Nada nuevo para analizar.' })
      }
    } catch {
      setReport({ tone: 'error', text: 'Error al analizar' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleBackfill} loading={loading} variant="secondary">
        {!loading && <PieChart aria-hidden className="h-4 w-4" />}
        {loading ? 'Analizando…' : 'Analizar polarización 80/20'}
      </Button>
      {report && <Alert variant={report.tone}>{report.text}</Alert>}
    </div>
  )
}
