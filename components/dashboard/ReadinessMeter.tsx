import { cn } from '@/lib/utils'
import type { ReadinessResult } from '@/lib/training/readiness'

const SOURCE_LABEL: Record<string, string> = {
  garmin: 'Garmin',
  declarado: 'cargado a mano',
  carga: 'solo carga de entrenamiento',
  'sin datos': 'sin datos',
}

function tone(score: number): { text: string; dot: string } {
  if (score >= 70) return { text: 'text-emerald-500', dot: 'bg-emerald-500' }
  if (score >= 50) return { text: 'text-sky-500', dot: 'bg-sky-500' }
  if (score >= 35) return { text: 'text-amber-500', dot: 'bg-amber-500' }
  return { text: 'text-red-500', dot: 'bg-red-500' }
}

/**
 * Readiness is the only metric that mixes recovery signals (sleep, HRV,
 * resting HR, soreness) with training load, so it sits next to the form meters
 * rather than inside them.
 */
export function ReadinessMeter({ readiness }: { readiness: ReadinessResult }) {
  const t = tone(readiness.score)
  const sources = readiness.dataSources.map((s) => SOURCE_LABEL[s] ?? s).join(' + ')

  return (
    <div className="rounded-xl border border-surface bg-background p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Readiness (hoy)</p>
          <p className={cn('text-[11px] font-medium', t.text)}>{readiness.label}</p>
        </div>
        <p className={cn('text-xl font-bold leading-none tabular-nums', t.text)}>{readiness.score}</p>
      </div>

      <div className="relative py-1.5">
        <div
          className="h-2.5 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, rgba(239,68,68,0.55) 0%, rgba(245,158,11,0.5) 35%, rgba(56,189,248,0.5) 50%, rgba(16,185,129,0.55) 70%, rgba(16,185,129,0.55) 100%)',
          }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readiness.score}
          aria-label="Readiness"
        />
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.55)] dark:shadow-[0_0_0_2px_rgba(255,255,255,0.35),0_2px_10px_rgba(0,0,0,0.8)]',
            t.dot
          )}
          style={{ left: `${readiness.score}%` }}
        />
      </div>

      {readiness.flags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {readiness.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[10px] leading-snug text-muted">
        Mezcla sueño, HRV, FC en reposo, estrés y sensaciones con tu forma. Fuente: {sources}.
      </p>
    </div>
  )
}
