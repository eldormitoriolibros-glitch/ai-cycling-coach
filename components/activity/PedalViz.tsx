import { Card } from '@/components/ui'
import {
  balanceNote,
  hasPedalData,
  phaseArcPath,
  phaseSpanDegrees,
  type PedalMetrics,
} from '@/lib/garmin/pedal-metrics'

function PhaseClock({
  label,
  start,
  end,
  color,
}: {
  label: string
  start: number
  end: number
  color: string
}) {
  const span = phaseSpanDegrees(start, end)
  const arc = phaseArcPath(40, 40, 28, start, end)
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 80 80" className="h-28 w-28" aria-hidden>
        <circle cx="40" cy="40" r="28" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="8" />
        <path d={arc} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <line x1="40" y1="12" x2="40" y2="18" className="stroke-slate-400" strokeWidth="1.5" />
        <text x="40" y="44" textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
          {span}°
        </text>
      </svg>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-[11px] text-muted">
        {Math.round(start)}° → {Math.round(end)}°
      </p>
    </div>
  )
}

export function PedalViz({ metrics }: { metrics: PedalMetrics | null | undefined }) {
  if (!hasPedalData(metrics)) return null
  const left = metrics!.leftPct
  const right = metrics!.rightPct
  const showBalance = left != null && right != null
  const showPhase =
    metrics!.leftPhaseStart != null &&
    metrics!.leftPhaseEnd != null &&
    metrics!.rightPhaseStart != null &&
    metrics!.rightPhaseEnd != null

  if (!showBalance && !showPhase) return null

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Pedaleo</h2>
        {showBalance ? (
          <p className="mt-1 text-sm text-muted">{balanceNote(left)}</p>
        ) : null}
      </div>

      {showBalance ? (
        <div>
          <div className="mb-1 flex justify-between text-xs font-medium">
            <span className="text-sky-700 dark:text-sky-300">I {Math.round(left)}%</span>
            <span className="text-muted">50/50</span>
            <span className="text-amber-700 dark:text-amber-300">D {Math.round(right)}%</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="absolute inset-y-0 left-0 bg-sky-500/80"
              style={{ width: `${left}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-amber-500/80"
              style={{ width: `${right}%` }}
            />
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-foreground/70" />
          </div>
        </div>
      ) : null}

      {showPhase ? (
        <div className="flex justify-center gap-8 pt-1">
          <PhaseClock
            label="Izquierda"
            start={metrics!.leftPhaseStart!}
            end={metrics!.leftPhaseEnd!}
            color="rgb(14 165 233)"
          />
          <PhaseClock
            label="Derecha"
            start={metrics!.rightPhaseStart!}
            end={metrics!.rightPhaseEnd!}
            color="rgb(245 158 11)"
          />
        </div>
      ) : null}
    </Card>
  )
}
