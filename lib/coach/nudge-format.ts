import { looksStrength } from '@/lib/training/split-sessions'

export type NudgeWorkout = {
  title: string | null
  description: string | null
  duration_minutes: number | null
  target_zone: string | null
  target_power: number | null
  target_hr: number | null
  purpose: string | null
  status: string | null
  workout_type: string | null
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'pendiente',
  completed: 'hecho',
  skipped: 'saltado',
  moved: 'movido',
}

function kindLabel(w: NudgeWorkout): string {
  return looksStrength(w.title, w.workout_type) ? 'Fuerza' : 'Bici'
}

function sessionLine(w: NudgeWorkout): string {
  const bits = [
    w.title ?? 'sesión',
    w.target_zone,
    w.duration_minutes != null ? `${w.duration_minutes} min` : null,
  ].filter(Boolean)
  const targets = [
    w.target_power ? `${w.target_power} W` : null,
    w.target_hr ? `${w.target_hr} ppm` : null,
  ].filter(Boolean)
  let line = bits.join(' · ')
  if (targets.length) line += ` (${targets.join(' / ')})`
  return line
}

/**
 * Builds the daily Telegram briefing from today's workouts.
 * Handles several sessions (bike + strength) and their status.
 */
export function formatDailyNudge(input: {
  name: string | null
  workouts: NudgeWorkout[]
  load: { chronic_load: number | null; acute_load: number | null; form: number | null } | null
}): string {
  const lines: string[] = []
  lines.push(input.name ? `Buenas, ${input.name}.` : 'Buenas.')
  lines.push('')

  const workouts = input.workouts
  if (workouts.length === 0) {
    lines.push('Hoy no hay sesión programada. Día libre.')
  } else {
    const pending = workouts.filter((w) => w.status === 'scheduled')
    const done = workouts.filter((w) => w.status === 'completed')
    const other = workouts.filter((w) => w.status !== 'scheduled' && w.status !== 'completed')

    if (pending.length === 0) {
      if (done.length === workouts.length) {
        lines.push(
          done.length === 1
            ? `Hoy ya marcaste la sesión de ${kindLabel(done[0]).toLowerCase()} como hecha. Nada pendiente.`
            : `Hoy ya completaste las ${done.length} sesiones (${done.map(kindLabel).join(' y ')}). Nada pendiente.`
        )
      } else {
        lines.push(
          `Hoy no queda nada pendiente. Estado: ${workouts
            .map((w) => `${kindLabel(w)} ${STATUS_LABEL[w.status ?? ''] ?? w.status}`)
            .join(', ')}.`
        )
      }
    } else {
      if (done.length > 0) {
        lines.push(
          `Hoy ya hiciste: ${done.map((w) => `${kindLabel(w)} (${w.title ?? 'sesión'})`).join(', ')}.`
        )
        lines.push('')
      }
      lines.push(pending.length === 1 ? 'Todavía tenés pendiente:' : 'Todavía tenés pendiente:')
      for (const w of pending) {
        lines.push(`• ${kindLabel(w)} — ${sessionLine(w)}`)
        if (w.description) lines.push(`  ${w.description}`)
        if (w.purpose) lines.push(`  Para qué: ${w.purpose}`)
      }
      if (other.length) {
        lines.push('')
        for (const w of other) {
          lines.push(`• ${kindLabel(w)} — ${STATUS_LABEL[w.status ?? ''] ?? w.status}: ${w.title ?? 'sesión'}`)
        }
      }
    }
  }

  if (input.load) {
    lines.push('')
    lines.push(
      `Estado: fitness ${round(input.load.chronic_load)}, fatiga ${round(input.load.acute_load)}, forma ${round(input.load.form)}. ${describeForm(input.load.form)}`
    )
  }

  lines.push('')
  lines.push('Preguntame lo que quieras si algo no cierra.')
  return lines.join('\n')
}

function round(value: number | null): string {
  return value === null ? 'n/d' : Math.round(value).toString()
}

function describeForm(tsb: number | null): string {
  if (tsb === null) return ''
  if (tsb > 20) return 'Estás muy descansado.'
  if (tsb > 5) return 'Venís fresco.'
  if (tsb > -10) return 'Vas equilibrado.'
  if (tsb > -30) return 'Venís cargado, cuidá el descanso.'
  return 'Estás muy fatigado; si hoy no rinde, no fuerces.'
}
