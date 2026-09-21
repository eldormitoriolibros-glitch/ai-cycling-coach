'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui'
import { computeDecoupling, type DecouplingSample } from '@/lib/training/decoupling'
import { cn } from '@/lib/utils'

const VERDICT = {
  solid: {
    label: 'Base sólida',
    className: 'text-emerald-600 dark:text-emerald-400',
    note: 'El motor aeróbico sostuvo los mismos vatios por pulsación hasta el final. Podés estirar la duración.',
  },
  watch: {
    label: 'Al límite',
    className: 'text-amber-600 dark:text-amber-400',
    note: 'Empezó a costarte sobre el final. Esta duración está justo en el borde de tu base actual.',
  },
  faded: {
    label: 'Se te fue',
    className: 'text-red-600 dark:text-red-400',
    note: 'El pulso se despegó de los vatios: a esta duración todavía no llegás cómodo. Puede ser base, calor o combustible.',
  },
}

/**
 * Pw:Hr drift across the ride. Only shown for long steady rides with power,
 * because on intervals or short outings the number means nothing.
 */
export function AerobicDecoupling({
  samples,
  ftp,
}: {
  samples: DecouplingSample[]
  ftp: number | null
}) {
  const outcome = useMemo(() => computeDecoupling({ samples, ftp }), [samples, ftp])

  if ('skip' in outcome) return null

  const { percent, verdict, first, second, analyzedSeconds } = outcome.result
  const tone = VERDICT[verdict]
  const drifted = percent > 0

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Desacople aeróbico</h2>
        <p className="text-xs text-muted">
          Vatios por pulsación en la primera mitad contra la segunda, sobre{' '}
          {Math.round(analyzedSeconds / 60)} min de rodado estable (sin la entrada en calor). Bajo 5%
          es una base durable.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className={cn('text-3xl font-bold tabular-nums tracking-tight', tone.className)}>
            {drifted ? '+' : ''}
            {percent.toFixed(1)}%
          </p>
          <p className={cn('text-sm font-medium', tone.className)}>{tone.label}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Half label="1ª mitad" half={first} />
          <Half label="2ª mitad" half={second} />
        </dl>
      </div>

      <p className="text-xs text-muted">{tone.note}</p>
    </Card>
  )
}

function Half({ label, half }: { label: string; half: { power: number; hr: number; ratio: number } }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">
        {half.power} W / {half.hr} ppm
      </dd>
      <dd className="text-[11px] tabular-nums text-muted">{half.ratio.toFixed(2)} W por pulsación</dd>
    </div>
  )
}
