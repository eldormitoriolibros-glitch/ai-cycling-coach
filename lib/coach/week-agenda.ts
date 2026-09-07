import { createAdminClient } from '@/lib/supabase/admin'
import { endOfWeek, formatWeekRange, localDateKey, startOfWeek } from '@/lib/training/dates'

import 'server-only'

export async function formatWeekAgenda(userId: string, timeZone: string): Promise<string> {
  const today = localDateKey(new Date(), timeZone)
  const start = startOfWeek(today)
  const end = endOfWeek(today)
  const { data } = await createAdminClient()
    .from('workouts')
    .select('scheduled_date, title, duration_minutes, target_zone, status, workout_type')
    .eq('user_id', userId)
    .gte('scheduled_date', start)
    .lte('scheduled_date', end)
    .order('scheduled_date', { ascending: true })

  const rows = data ?? []
  const header = `Semana ${formatWeekRange(start, end)}`
  if (!rows.length) return `${header}\nSin sesiones cargadas. Pedime que te arme la semana.`

  const lines = rows.map((w) => {
    const day = new Date(`${w.scheduled_date}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })
    const mins = w.duration_minutes ? `${w.duration_minutes} min` : ''
    const zone = w.target_zone ? ` · ${w.target_zone}` : ''
    const status = w.status === 'scheduled' ? '' : ` (${w.status})`
    return `• ${day}: ${w.title ?? w.workout_type ?? 'Sesión'} ${mins}${zone}${status}`.replace(/\s+/g, ' ').trim()
  })
  return [header, ...lines, '', 'Si querés cambiar algo, pedímelo y confirmá el cambio con un sí.'].join('\n')
}
