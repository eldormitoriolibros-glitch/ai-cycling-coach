import { RecoveryForm } from '@/components/RecoveryForm'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { localDateKey } from '@/lib/training/dates'

export const dynamic = 'force-dynamic'

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
      .select('date, resting_hr, hrv, soreness, motivation')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(14),
    supabase
      .from('sleep')
      .select('date, source, duration_minutes, sleep_score')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(28),
  ])

  // Sleep and recovery live in separate tables, and each can have a manual and
  // a Garmin row per day. What the athlete typed wins over what Garmin guessed.
  const sleepByDate = new Map<string, { duration_minutes: number | null; sleep_score: number | null }>()
  for (const row of sleep ?? []) {
    const current = sleepByDate.get(row.date)
    if (!current || (row.source === 'manual' && row.duration_minutes != null)) {
      sleepByDate.set(row.date, { duration_minutes: row.duration_minutes, sleep_score: row.sleep_score })
    }
  }

  const dates = Array.from(
    new Set([...(recovery ?? []).map((r) => r.date), ...Array.from(sleepByDate.keys())])
  )
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 10)

  const recoveryByDate = new Map((recovery ?? []).map((r) => [r.date, r]))
  const recent = dates.map((date) => ({
    date,
    ...recoveryByDate.get(date),
    sleepHours: sleepByDate.get(date)?.duration_minutes,
    sleepScore: sleepByDate.get(date)?.sleep_score,
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Recuperación</h1>
      <p className="text-sm text-slate-600">
        Con el ciclocomputador, la carga ya sale de las salidas. Sueño y HRV a mano no
        reconstruyen el historial ni reemplazan un reloj: los gráficos de forma no
        dependen de esta página. Cuando conectes un dispositivo que los mida solo,
        aparecen acá y en el panel.
      </p>

      <details className="rounded-xl border border-surface bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Cargar sueño o sensaciones a mano
        </summary>
        <div className="mt-3">
          <RecoveryForm today={today} />
        </div>
      </details>

      {recent && recent.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Últimos registros
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1 font-medium">Fecha</th>
                <th className="py-1 text-right font-medium">Sueño</th>
                <th className="py-1 text-right font-medium">Calidad</th>
                <th className="py-1 text-right font-medium">FC rep.</th>
                <th className="py-1 text-right font-medium">HRV</th>
                <th className="py-1 text-right font-medium">Dolor</th>
                <th className="py-1 text-right font-medium">Ganas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((row) => (
                <tr key={row.date}>
                  <td className="py-2">{row.date}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.sleepHours != null ? `${(row.sleepHours / 60).toFixed(1)} h` : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.sleepScore ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{row.resting_hr ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{row.hrv ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{row.soreness ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{row.motivation ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
