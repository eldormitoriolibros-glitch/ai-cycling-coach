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

  const { data: recent } = await supabase
    .from('recovery_metrics')
    .select('date, resting_hr, hrv, soreness, motivation')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Recuperación</h1>
      <p className="text-sm text-slate-600">
        Estos datos entran directo en el contexto del entrenador. Un par de números por día alcanzan
        para que note cuándo venís quemado.
      </p>

      <RecoveryForm today={today} />

      {recent && recent.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Últimos registros
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1 font-medium">Fecha</th>
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
