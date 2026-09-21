import Link from 'next/link'
import { ApplyFtpButton } from '@/components/ApplyFtpButton'
import { Alert, Card } from '@/components/ui'
import { loadPowerSummary, type CurvePoint } from '@/lib/training/ftp'
import { createClient } from '@/lib/supabase/server'
import { ZONE_COLORS } from '@/lib/training/zones'
import { decouplingVerdict } from '@/lib/training/decoupling'
import { buildEfficiencyTrend } from '@/lib/training/efficiency-factor'
import { PedalTrend } from '@/components/dashboard/PedalTrend'
import { EfficiencyTrend } from '@/components/dashboard/EfficiencyTrend'

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

  // Guard against unauthenticated access and surface errors instead of crashing
  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Potencia</h1>
        <Card>
          <p className="text-sm text-muted">Debés iniciar sesión para ver esta página.</p>
        </Card>
      </div>
    )
  }

  let summary = null
  let metrics = null
  let estimatedOnly = 0
  let drift: DriftPoint[] = []
  let efficiency = buildEfficiencyTrend([])
  try {
    const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString()
    const results = await Promise.all([
      loadPowerSummary(user.id),
      supabase.from('athlete_metrics').select('ftp, ftp_source, ftp_updated_at').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('streams_status', 'no_power'),
      supabase
        .from('activities')
        .select('id, title, start_time, decoupling_percent, decoupling_seconds')
        .eq('user_id', user.id)
        .eq('decoupling_status', 'ok')
        .order('start_time', { ascending: true })
        .limit(60),
      supabase
        .from('activities')
        .select(
          'id, title, start_time, moving_seconds, duration_seconds, normalized_power, avg_power, avg_hr, intensity_factor'
        )
        .eq('user_id', user.id)
        .eq('has_power_meter', true)
        .gte('start_time', yearAgo)
        .not('avg_hr', 'is', null)
        .order('start_time', { ascending: false })
        .limit(200),
    ])
    summary = results[0]
    metrics = results[1].data
    estimatedOnly = results[2].count ?? 0
    drift = (results[3].data ?? [])
      .filter((row) => row.decoupling_percent != null)
      .map((row) => ({
        id: row.id,
        title: row.title,
        date: row.start_time,
        percent: Number(row.decoupling_percent),
        seconds: row.decoupling_seconds ?? 0,
      }))
    efficiency = buildEfficiencyTrend(
      (results[4].data ?? []).map((row) => ({
        id: row.id,
        date: row.start_time.slice(0, 10),
        title: row.title,
        seconds: row.moving_seconds ?? row.duration_seconds ?? 0,
        normalizedPower: row.normalized_power,
        averagePower: row.avg_power,
        averageHr: row.avg_hr,
        intensityFactor: row.intensity_factor,
      }))
    )
  } catch (err) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Potencia</h1>
        <Card>
          <Alert variant="error">No se pudo cargar la curva de potencia. Volvé a intentarlo más tarde.</Alert>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Potencia</h1>
      <p className="text-sm text-muted">
        Mejores esfuerzos de los últimos {summary.windowDays} días, sobre {summary.ridesWithPower}{' '}
        salidas con potenciómetro.
      </p>

      <PedalTrend />
      <EfficiencyTrend trend={efficiency} />

      {summary.curve.length === 0 ? (
        <Card className="space-y-3">
          {estimatedOnly ? (
            <>
              <p className="text-sm text-foreground">
                No se puede construir la curva de potencia con tus datos actuales.
              </p>
              <p className="text-sm text-muted">
                Tus {estimatedOnly} salidas tienen potencia <strong>estimada</strong> por Strava a
                partir de velocidad, pendiente y peso ({'device_watts: false'}). Para ese tipo de
                potencia Strava publica el promedio de la actividad, pero no el detalle segundo a
                segundo, y sin ese detalle no hay mejores esfuerzos de 20 minutos que medir.
              </p>
              <p className="text-sm text-muted">
                Mientras tanto: cargá tu FTP a mano en{' '}
                <Link href="/profile" className="font-medium underline">
                  Perfil
                </Link>
                . Aunque sea aproximado, destraba el cálculo de carga de todas tus salidas.
              </p>
              <Alert variant="info">
                Con un potenciómetro real, o con un pulsómetro emparejado al ciclocomputadora,
                Strava sí entrega el detalle y esta página se llena sola.
              </Alert>
            </>
          ) : (
            <p className="text-sm text-muted">
              Todavía no hay curva de potencia. Sincronizá Garmin: las salidas con potenciómetro
              arman NP y mejores esfuerzos a partir del FIT.
            </p>
          )}
        </Card>
      ) : (
        <>
          <Card className="space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Curva de potencia
            </h2>
            <PowerCurveChart points={summary.curve} />
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {summary.curve.map((point) => (
                <div key={point.duration}>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    {formatDuration(point.duration)}
                  </dt>
                  <dd className="font-semibold tabular-nums">{point.watts} W</dd>
                  <dd className="text-xs text-muted">{point.date}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {summary.estimate && (
            <Card className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                FTP estimado
              </h2>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">{summary.estimate.ftp} W</p>
              <p className="text-sm text-muted">
                Calculado desde tu mejor esfuerzo de {summary.estimate.basisLabel} (
                {summary.estimate.basisWatts} W × {summary.estimate.factor}), el{' '}
                {summary.estimate.date}
                {summary.estimate.title ? ` en «${summary.estimate.title}»` : ''}.
              </p>
              <p className="text-xs text-muted">
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

      {drift.length >= 2 && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Desacople aeróbico
          </h2>
          <p className="mt-1 text-xs text-muted">
            Cuánto se despega el pulso de los vatios en cada rodado largo y estable. Bajar con el
            tiempo, o aguantar lo mismo en salidas más largas, es la base creciendo. Solo aparecen
            las salidas con potenciómetro de 50 min o más sin intervalos.
          </p>
          <div className="mt-4">
            <DriftTrend points={drift} />
          </div>
        </Card>
      )}

      {metrics?.ftp && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Zonas de potencia
          </h2>
          <p className="mt-1 text-xs text-muted">Escala Coggan sobre tu FTP de {metrics.ftp} W.</p>
          <div className="mt-4">
            <ZoneSpectrum ftp={metrics.ftp} />
          </div>
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
            stroke="rgb(var(--border-rgb))"
            strokeWidth={1}
          />
          <text
            x={pad.left - 8}
            y={y(watts) + 4}
            textAnchor="end"
            fill="rgb(var(--muted-rgb))"
            className="text-[10px]"
          >
            {watts}
          </text>
        </g>
      ))}

      <path d={path} fill="none" stroke="rgb(var(--accent-500))" strokeWidth={2} />

      {points.map((point) => (
        <g key={point.duration}>
          <circle cx={x(point.duration)} cy={y(point.watts)} r={3.5} fill="rgb(var(--accent-500))" />
          <text
            x={x(point.duration)}
            y={height - pad.bottom + 16}
            textAnchor="middle"
            fill="rgb(var(--muted-rgb))"
            className="text-[10px]"
          >
            {formatDuration(point.duration)}
          </text>
        </g>
      ))}
    </svg>
  )
}

type DriftPoint = {
  id: string
  title: string | null
  date: string
  percent: number
  seconds: number
}

const DRIFT_COLORS = { solid: '#10b981', watch: '#f59e0b', faded: '#ef4444' } as const

/**
 * Drift per ride over time. Dot size is ride length, because holding 4% for
 * four hours is a different animal than holding it for one.
 */
function DriftTrend({ points }: { points: DriftPoint[] }) {
  const width = 640
  const height = 220
  const pad = { top: 16, right: 16, bottom: 34, left: 40 }

  const times = points.map((p) => new Date(p.date).getTime())
  const minTime = Math.min(...times)
  const timeSpan = Math.max(...times) - minTime || 1

  const maxPercent = Math.max(10, ...points.map((p) => p.percent))
  const minPercent = Math.min(0, ...points.map((p) => p.percent))
  const span = maxPercent - minPercent || 1

  const x = (date: string) =>
    pad.left + ((new Date(date).getTime() - minTime) / timeSpan) * (width - pad.left - pad.right)
  const y = (percent: number) =>
    pad.top + ((maxPercent - percent) / span) * (height - pad.top - pad.bottom)

  const maxSeconds = Math.max(...points.map((p) => p.seconds), 1)
  const radius = (seconds: number) => 3 + (seconds / maxSeconds) * 4

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date)} ${y(p.percent)}`).join(' ')
  const recent = points.slice(-3)
  const average = recent.reduce((sum, p) => sum + p.percent, 0) / recent.length

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Tendencia del desacople aeróbico"
      >
        {/* Under 5% is durable; 5–8% is the warning strip. */}
        <rect
          x={pad.left}
          y={y(Math.min(5, maxPercent))}
          width={width - pad.left - pad.right}
          height={Math.max(0, y(minPercent) - y(Math.min(5, maxPercent)))}
          fill={DRIFT_COLORS.solid}
          opacity={0.08}
        />
        <rect
          x={pad.left}
          y={y(Math.min(8, maxPercent))}
          width={width - pad.left - pad.right}
          height={Math.max(0, y(Math.min(5, maxPercent)) - y(Math.min(8, maxPercent)))}
          fill={DRIFT_COLORS.watch}
          opacity={0.08}
        />

        {[0, 5, 8].map((tick) =>
          tick >= minPercent && tick <= maxPercent ? (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="rgb(var(--border-rgb))"
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : '4 3'}
              />
              <text
                x={pad.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fill="rgb(var(--muted-rgb))"
                className="text-[10px]"
              >
                {tick}%
              </text>
            </g>
          ) : null
        )}

        <path d={path} fill="none" stroke="rgb(var(--border-rgb))" strokeWidth={1.5} />

        {points.map((point) => (
          <circle
            key={point.id}
            cx={x(point.date)}
            cy={y(point.percent)}
            r={radius(point.seconds)}
            fill={DRIFT_COLORS[decouplingVerdict(point.percent)]}
            fillOpacity={0.85}
          />
        ))}

        {[points[0], points[points.length - 1]].map((point, i) => (
          <text
            key={point.id + i}
            x={x(point.date)}
            y={height - pad.bottom + 18}
            textAnchor={i === 0 ? 'start' : 'end'}
            fill="rgb(var(--muted-rgb))"
            className="text-[10px]"
          >
            {new Date(point.date).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })}
          </text>
        ))}
      </svg>

      <p className="text-xs text-muted">
        Últimas {recent.length} salidas: {average.toFixed(1)}% de promedio. El tamaño del punto es
        la duración analizada; la más larga acá es de{' '}
        {Math.round(maxSeconds / 60)} min.
      </p>
    </div>
  )
}

function ZoneSpectrum({ ftp }: { ftp: number }) {
  const segments = ZONES.map((zone) => {
    const start = zone.from
    const end = zone.to ?? 1.4
    return {
      ...zone,
      color: ZONE_COLORS[zone.name] ?? ZONE_COLORS.Z1,
      span: Math.max(end - start, 0.12),
      wattsFrom: Math.round(ftp * zone.from),
      wattsTo: zone.to ? Math.round(ftp * zone.to) : null,
    }
  })
  const total = segments.reduce((sum, zone) => sum + zone.span, 0)

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map((zone) => (
          <div
            key={zone.name}
            title={`${zone.name} ${zone.label}`}
            style={{ width: `${(zone.span / total) * 100}%`, background: zone.color }}
          />
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {segments.map((zone) => (
          <li key={zone.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: zone.color }} />
              <span className="font-medium">{zone.name}</span>
              <span className="truncate text-muted">{zone.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {zone.wattsTo ? `${zone.wattsFrom}–${zone.wattsTo}` : `${zone.wattsFrom}+`} W
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
