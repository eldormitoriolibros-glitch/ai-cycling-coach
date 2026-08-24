import { ApplyFtpButton } from '@/components/ApplyFtpButton'
import { Card } from '@/components/ui'
import { loadPowerSummary, type CurvePoint } from '@/lib/training/ftp'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ZONES: Array<{ name: string; label: string; from: number; to: number | null }> = [
  { name: 'Z1', label: 'Recuperación', from: 0, to: 0.55 },
  { name: 'Z2', label: 'Fondo', from: 0.56, to: 0.75 },
  { name: 'Z3', label: 'Tempo', from: 0.76, to: 0.9 },
  { name: 'Z4', label: 'Umbral', from: 0.91, to: 1.05 },
  { name: 'Z5', label: 'VO2 máx', from: 1.06, to: 1.2 },
  { name: 'Z6', label: 'Anaeróbico', from: 1.21, to: null },
]

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${seconds / 60}min`
  return `${seconds / 3600}h`
}

export default async function PowerPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [summary, { data: metrics }] = await Promise.all([
    loadPowerSummary(user!.id),
    supabase.from('athlete_metrics').select('ftp, ftp_source, ftp_updated_at').eq('user_id', user!.id).maybeSingle(),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Potencia</h1>
      <p className="text-sm text-slate-600">
        Mejores esfuerzos de los últimos {summary.windowDays} días, sobre {summary.ridesWithPower}{' '}
        salidas con potenciómetro.
      </p>

      {summary.curve.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Todavía no hay datos de potencia. Sincronizá Strava; las salidas con potenciómetro se
            procesan solas después de cada sincronización.
          </p>
        </Card>
      ) : (
        <>
          <Card className="space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
              Curva de potencia
            </h2>
            <PowerCurveChart points={summary.curve} />
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {summary.curve.map((point) => (
                <div key={point.duration}>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">
                    {formatDuration(point.duration)}
                  </dt>
                  <dd className="font-semibold text-slate-900">{point.watts} W</dd>
                  <dd className="text-xs text-slate-400">{point.date}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {summary.estimate && (
            <Card className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
                FTP estimado
              </h2>
              <p className="text-3xl font-semibold text-slate-900">{summary.estimate.ftp} W</p>
              <p className="text-sm text-slate-600">
                Calculado desde tu mejor esfuerzo de {summary.estimate.basisLabel} (
                {summary.estimate.basisWatts} W × {summary.estimate.factor}), el{' '}
                {summary.estimate.date}
                {summary.estimate.title ? ` en «${summary.estimate.title}»` : ''}.
              </p>
              <p className="text-xs text-slate-400">
                FTP actual: {metrics?.ftp ? `${metrics.ftp} W` : 'sin cargar'}
                {metrics?.ftp_source === 'estimated' ? ' (estimado)' : ''}
              </p>
              {!summary.estimate.fromPowerMeter && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Ese esfuerzo no viene de un potenciómetro: Strava estimó los vatios a partir de
                  velocidad, pendiente y peso. Sirve para tener una referencia y para que la carga
                  deje de estar vacía, pero el número puede irse fácil un 10–20%. Revisá que tu peso
                  esté bien cargado en el perfil, que es lo que más afecta la estimación.
                </p>
              )}
              <ApplyFtpButton ftp={summary.estimate.ftp} currentFtp={metrics?.ftp ?? null} />
            </Card>
          )}
        </>
      )}

      {metrics?.ftp && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Zonas de potencia
          </h2>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {ZONES.map((zone) => (
                <tr key={zone.name}>
                  <td className="py-2 font-medium">{zone.name}</td>
                  <td className="py-2 text-slate-600">{zone.label}</td>
                  <td className="py-2 text-right tabular-nums">
                    {Math.round(metrics.ftp! * zone.from)}
                    {zone.to ? `–${Math.round(metrics.ftp! * zone.to)}` : '+'} W
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

/** Static SVG — a log-x line chart does not need a charting library or client JS. */
function PowerCurveChart({ points }: { points: CurvePoint[] }) {
  const width = 640
  const height = 240
  const pad = { top: 16, right: 16, bottom: 32, left: 48 }

  const minDuration = points[0].duration
  const maxDuration = points[points.length - 1].duration
  const maxWatts = Math.max(...points.map((p) => p.watts))

  const logMin = Math.log(minDuration)
  const logSpan = Math.log(maxDuration) - logMin || 1

  const x = (duration: number) =>
    pad.left + ((Math.log(duration) - logMin) / logSpan) * (width - pad.left - pad.right)
  const y = (watts: number) =>
    pad.top + (1 - watts / (maxWatts * 1.1)) * (height - pad.top - pad.bottom)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.duration)} ${y(p.watts)}`).join(' ')

  const gridWatts = [0.25, 0.5, 0.75, 1].map((f) => Math.round(maxWatts * 1.1 * f))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Curva de potencia media máxima"
    >
      {gridWatts.map((watts) => (
        <g key={watts}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(watts)}
            y2={y(watts)}
            className="stroke-slate-200"
            strokeWidth={1}
          />
          <text x={pad.left - 8} y={y(watts) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
            {watts}
          </text>
        </g>
      ))}

      <path d={path} fill="none" className="stroke-slate-900" strokeWidth={2} />

      {points.map((point) => (
        <g key={point.duration}>
          <circle cx={x(point.duration)} cy={y(point.watts)} r={3.5} className="fill-slate-900" />
          <text
            x={x(point.duration)}
            y={height - pad.bottom + 16}
            textAnchor="middle"
            className="fill-slate-400 text-[10px]"
          >
            {formatDuration(point.duration)}
          </text>
        </g>
      ))}
    </svg>
  )
}
