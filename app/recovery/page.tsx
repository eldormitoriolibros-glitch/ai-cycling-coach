import { RecoveryChart } from '@/components/dashboard/RecoveryChart'
import { MorningCheckIn } from '@/components/recovery/MorningCheckIn'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { localDateKey } from '@/lib/training/dates'
import { BODY_FEEL, MOOD, bodyFeelFromSoreness, moodFromMotivation } from '@/lib/training/check-in'
import { buildRecoverySeries, type RecoveryDayPoint } from '@/lib/training/recovery-series'

export const dynamic = 'force-dynamic'

function formatHours(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} h`
}

function bodyLabel(soreness: number | null): string {
  const id = bodyFeelFromSoreness(soreness)
  return BODY_FEEL.find((o) => o.id === id)?.label ?? '—'
}

function moodLabel(motivation: number | null): string {
  const id = moodFromMotivation(motivation)
  return MOOD.find((o) => o.id === id)?.label ?? '—'
}

function HistoryRow({ row }: { row: RecoveryDayPoint }) {
  const body = bodyLabel(row.soreness)
  const mood = moodLabel(row.motivation)
  return (
    <>
      <tr className="hidden sm:table-row">
        <td className="py-2">{row.date}</td>
        <td className="py-2 text-right tabular-nums">{formatHours(row.sleepHours)}</td>
        <td className="py-2 text-right tabular-nums">{row.sleepScore ?? '—'}</td>
        <td className="py-2 text-right tabular-nums">{row.restingHr ?? '—'}</td>
        <td className="py-2 text-right tabular-nums">{row.hrv != null ? Math.round(row.hrv) : '—'}</td>
        <td className="py-2 text-right">{body}</td>
        <td className="py-2 text-right">{mood}</td>
      </tr>
      <tr className="sm:hidden">
        <td className="py-3" colSpan={7}>
          <p className="font-medium">{row.date}</p>
          <p className="mt-1 text-xs text-muted">
            Sueño {formatHours(row.sleepHours)}
            {row.sleepScore != null ? ` · calidad ${row.sleepScore}` : ''}
            {row.restingHr != null ? ` · FC ${row.restingHr}` : ''}
            {row.hrv != null ? ` · HRV ${Math.round(row.hrv)}` : ''}
            {body !== '—' ? ` · ${body}` : ''}
            {mood !== '—' ? ` · ${mood}` : ''}
          </p>
        </td>
      </tr>
    </>
  )
}

export default async function RecoveryPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', user!.id)
    .maybeSingle()

  const today = localDateKey(new Date(), profile?.timezone || 'UTC')

  const [{ data: recovery }, { data: sleep }] = await Promise.all([
    supabase
      .from('recovery_metrics')
      .select('date, source, resting_hr, hrv, soreness, motivation')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(28),
    supabase
      .from('sleep')
      .select('date, source, duration_minutes, sleep_score')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(28),
  ])

  const { series } = buildRecoverySeries({
    today,
    days: 14,
    sleep: sleep ?? [],
    recovery: recovery ?? [],
  })
  const recent = [...series]
    .reverse()
    .filter((row) =>
      [row.sleepHours, row.sleepScore, row.restingHr, row.hrv, row.soreness, row.motivation].some((v) => v != null)
    )
  const hasChart = series.some((row) => row.sleepHours != null)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Recuperación</h1>
      <p className="text-sm text-muted">Sueño de anoche y cómo amaneciste. Un minuto, cada mañana.</p>

      <section id="cargar" className="scroll-mt-24">
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted">Cómo amaneciste</h2>
          <MorningCheckIn today={today} />
        </Card>
      </section>

      {hasChart ? (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Sueño, 14 días</h2>
          <p className="mt-1 text-xs text-muted">Barras = horas. Línea = calidad, si la cargaste.</p>
          <div className="mt-3">
            <RecoveryChart series={series} height={200} />
          </div>
        </Card>
      ) : null}

      {recent.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Últimos registros</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1 font-medium">Fecha</th>
                <th className="py-1 text-right font-medium">Sueño</th>
                <th className="py-1 text-right font-medium">Calidad</th>
                <th className="py-1 text-right font-medium">FC rep.</th>
                <th className="py-1 text-right font-medium">HRV</th>
                <th className="py-1 text-right font-medium">Cuerpo</th>
                <th className="py-1 text-right font-medium">Ganas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface">
              {recent.map((row) => (
                <HistoryRow key={row.date} row={row} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
