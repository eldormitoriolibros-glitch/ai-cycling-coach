import type { ExperienceLevel } from '@/lib/types/database'
import { addDays, dayOfWeek } from './dates'

/**
 * Deterministic weekly plan builder.
 *
 * Pure functions only — no database, no AI. The AI layer explains the output,
 * it never produces the numbers.
 */

export type SessionKind = 'recovery' | 'endurance' | 'long' | 'tempo' | 'threshold' | 'vo2max'

export type AvailabilityWindow = {
  day_of_week: number
  bike_minutes: number
  strength_minutes: number
}

export type PlannerInput = {
  /** First day of the plan, `YYYY-MM-DD`. */
  startDate: string
  availability: AvailabilityWindow[]
  ftp: number | null
  maxHr: number | null
  chronicLoad: number | null
  form: number | null
  experience: ExperienceLevel | null
  /** Consecutive loading weeks already committed before this one. */
  loadingWeeksInBlock: number
}

export type WorkoutDraft = {
  scheduled_date: string
  workout_type: SessionKind
  title: string
  description: string
  duration_minutes: number
  target_zone: string
  target_power: number | null
  target_hr: number | null
  purpose: string
  estimated_load: number
}

export type PlanEmphasis = 'recovery' | 'maintenance' | 'build'

/** Three loading weeks, then a deload. */
export const BLOCK_LENGTH = 4

export type PlanDraft = {
  startDate: string
  endDate: string
  emphasis: PlanEmphasis
  blockPosition: number
  weeklyTargetLoad: number
  plannedLoad: number
  workouts: WorkoutDraft[]
  notes: string[]
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** `intensityFactor` drives the load estimate; `powerFactor` is the interval target. */
const TEMPLATES: Record<
  SessionKind,
  {
    zone: string
    intensityFactor: number
    powerFactor: number
    hrFactor: number
    softCapMinutes: number
    title: string
    description: string
    purpose: string
  }
> = {
  recovery: {
    zone: 'Z1',
    intensityFactor: 0.55,
    powerFactor: 0.5,
    hrFactor: 0.6,
    softCapMinutes: 60,
    title: 'Regenerativo',
    description: 'Rodaje muy suave, cadencia alta y plato chico. No pases de Z1 ni en las subidas.',
    purpose: 'Mover las piernas y acelerar la recuperación sin agregar fatiga.',
  },
  endurance: {
    zone: 'Z2',
    intensityFactor: 0.68,
    powerFactor: 0.65,
    hrFactor: 0.7,
    softCapMinutes: 150,
    title: 'Fondo aeróbico',
    description: 'Ritmo constante en Z2. Tenés que poder mantener una conversación todo el rato.',
    purpose: 'Construir base aeróbica: el motor que sostiene todo lo demás.',
  },
  long: {
    zone: 'Z2',
    intensityFactor: 0.7,
    powerFactor: 0.65,
    hrFactor: 0.7,
    softCapMinutes: 300,
    title: 'Salida larga',
    description:
      'La salida más larga de la semana, en Z2. Comé algo cada 45 min y tomá agua desde el arranque.',
    purpose: 'Resistencia y eficiencia usando grasas como combustible.',
  },
  tempo: {
    zone: 'Z3',
    intensityFactor: 0.8,
    powerFactor: 0.85,
    hrFactor: 0.8,
    softCapMinutes: 105,
    title: 'Tempo',
    description:
      '15 min de entrada en Z2, después 2 bloques de 20 min en Z3 con 10 min suaves entre medio, y 10 min de vuelta a la calma.',
    purpose: 'Subir el techo aeróbico con una fatiga que se paga rápido.',
  },
  threshold: {
    zone: 'Z4',
    intensityFactor: 0.88,
    powerFactor: 0.98,
    hrFactor: 0.88,
    softCapMinutes: 90,
    title: 'Umbral',
    description:
      '15 min de entrada, 4 bloques de 8 min al FTP con 4 min suaves entre cada uno, 10 min de vuelta a la calma.',
    purpose: 'Empujar el FTP para arriba: la métrica que más cambia tu rendimiento.',
  },
  vo2max: {
    zone: 'Z5',
    intensityFactor: 0.92,
    powerFactor: 1.12,
    hrFactor: 0.93,
    softCapMinutes: 75,
    title: 'VO2 máx',
    description:
      '20 min de entrada progresiva, 5 series de 4 min fuerte con 4 min suaves, 10 min de vuelta a la calma.',
    purpose: 'Ampliar el consumo máximo de oxígeno. Duele, pero rinde.',
  },
}

function loadFor(minutes: number, intensityFactor: number): number {
  return Math.round((minutes / 60) * intensityFactor ** 2 * 100)
}

/** Hard days are spread out: never two in a row, biggest windows first. */
function pickHardDays(candidates: { date: string; capMinutes: number }[], count: number): Set<string> {
  const picked = new Set<string>()
  const byCapacity = [...candidates].sort((a, b) => b.capMinutes - a.capMinutes)

  for (const candidate of byCapacity) {
    if (picked.size >= count) break

    const index = candidates.findIndex((c) => c.date === candidate.date)
    const neighbours = [candidates[index - 1]?.date, candidates[index + 1]?.date]
    if (neighbours.some((d) => d && picked.has(d))) continue

    picked.add(candidate.date)
  }

  // Fall back to allowing adjacency rather than returning fewer sessions.
  for (const candidate of byCapacity) {
    if (picked.size >= count) break
    picked.add(candidate.date)
  }

  return picked
}

function chooseEmphasis(
  form: number | null,
  chronic: number | null,
  loadingWeeksInBlock: number
): PlanEmphasis {
  // A deload is due on schedule even if you still feel fresh.
  if (loadingWeeksInBlock >= BLOCK_LENGTH - 1) return 'recovery'
  if (form !== null && form < -25) return 'recovery'
  if (chronic !== null && chronic > 0 && form !== null && form > 5) return 'build'
  return 'maintenance'
}

function hardSessionCount(emphasis: PlanEmphasis, chronic: number, experience: ExperienceLevel | null) {
  if (emphasis === 'recovery') return 0
  if (experience === 'beginner' || chronic < 25) return 1
  return 2
}

export function buildWeeklyPlan(input: PlannerInput): PlanDraft {
  const notes: string[] = []
  const startDate = input.startDate
  const endDate = addDays(startDate, 6)

  const windows = new Map(input.availability.map((a) => [a.day_of_week, a]))

  const candidates = Array.from({ length: 7 }, (_, offset) => addDays(startDate, offset))
    .map((date) => {
      const window = windows.get(dayOfWeek(date))
      if (!window) return null
      const capMinutes = window.bike_minutes
      return capMinutes >= 30 ? { date, capMinutes } : null
    })
    .filter((c): c is { date: string; capMinutes: number } => c !== null)

  if (candidates.length === 0) {
    notes.push(
      'No hay días disponibles con al menos 30 minutos. Configurá tu disponibilidad para poder planificar.'
    )
    return {
      startDate,
      endDate,
      emphasis: 'maintenance',
      blockPosition: 1,
      weeklyTargetLoad: 0,
      plannedLoad: 0,
      workouts: [],
      notes,
    }
  }

  const chronic = input.chronicLoad ?? 0
  const emphasis = chooseEmphasis(input.form, input.chronicLoad, input.loadingWeeksInBlock)
  const blockPosition = emphasis === 'recovery' ? BLOCK_LENGTH : input.loadingWeeksInBlock + 1

  // Weekly target: maintain CTL, then adjust by current freshness.
  const maintenance = chronic * 7
  const multiplier = emphasis === 'recovery' ? 0.65 : emphasis === 'build' ? 1.08 : 1.02
  const capacity = candidates.reduce((sum, c) => sum + loadFor(c.capMinutes, 0.72), 0)

  let weeklyTargetLoad = Math.round(maintenance * multiplier)
  if (weeklyTargetLoad < 50) {
    // No usable history yet: fill roughly 70% of the available time at Z2.
    weeklyTargetLoad = Math.round(capacity * 0.7)
    notes.push('Todavía no hay historial suficiente, así que la semana se dimensiona por tiempo disponible.')
  }
  weeklyTargetLoad = Math.min(weeklyTargetLoad, Math.round(capacity * 0.9))

  const hardCount = hardSessionCount(emphasis, chronic, input.experience)
  const hardDays = pickHardDays(candidates, Math.min(hardCount, candidates.length))

  const longDay = candidates.reduce(
    (best, c) => (!hardDays.has(c.date) && c.capMinutes > (best?.capMinutes ?? 0) ? c : best),
    null as { date: string; capMinutes: number } | null
  )

  const hardKinds: SessionKind[] = chronic < 40 ? ['tempo', 'threshold'] : ['threshold', 'vo2max']

  let hardIndex = 0
  const assigned = candidates.map((candidate) => {
    let kind: SessionKind
    if (hardDays.has(candidate.date)) {
      kind = hardKinds[hardIndex++ % hardKinds.length]
    } else if (emphasis === 'recovery') {
      kind = 'recovery'
    } else if (longDay && candidate.date === longDay.date) {
      kind = 'long'
    } else {
      kind = 'endurance'
    }
    return { ...candidate, kind }
  })

  // First pass at full soft-capped duration, then scale to hit the weekly target.
  const provisional = assigned.map((day) => {
    const template = TEMPLATES[day.kind]
    return { ...day, minutes: Math.min(day.capMinutes, template.softCapMinutes) }
  })

  const provisionalLoad = provisional.reduce(
    (sum, d) => sum + loadFor(d.minutes, TEMPLATES[d.kind].intensityFactor),
    0
  )
  const scale = provisionalLoad > 0 ? clamp(weeklyTargetLoad / provisionalLoad, 0.5, 1) : 1

  const workouts: WorkoutDraft[] = []
  for (const day of provisional) {
    const template = TEMPLATES[day.kind]
    const minutes = roundTo(day.minutes * scale, 5)

    if (minutes < 30) {
      notes.push(`Se descartó el ${DAY_NAMES[dayOfWeek(day.date)]}: quedaba una sesión demasiado corta.`)
      continue
    }

    workouts.push({
      scheduled_date: day.date,
      workout_type: day.kind,
      title: template.title,
      description: template.description,
      duration_minutes: minutes,
      target_zone: template.zone,
      target_power: input.ftp ? Math.round(input.ftp * template.powerFactor) : null,
      target_hr: input.maxHr ? Math.round(input.maxHr * template.hrFactor) : null,
      purpose: template.purpose,
      estimated_load: loadFor(minutes, template.intensityFactor),
    })
  }

  if (!input.ftp) notes.push('Sin FTP cargado no hay objetivos de potencia. Cargalo en el perfil.')
  if (!input.maxHr) notes.push('Sin FC máxima no hay objetivos de pulso. Cargala en el perfil.')
  if (emphasis === 'recovery') {
    notes.push(
      input.loadingWeeksInBlock >= BLOCK_LENGTH - 1
        ? `Semana ${blockPosition} de ${BLOCK_LENGTH}: toca descarga después de ${input.loadingWeeksInBlock} semanas de carga.`
        : 'Tu forma está muy negativa, así que esta semana baja la carga a propósito.'
    )
  } else {
    notes.push(`Semana ${blockPosition} de ${BLOCK_LENGTH} del bloque.`)
  }

  return {
    startDate,
    endDate,
    emphasis,
    blockPosition,
    weeklyTargetLoad,
    plannedLoad: workouts.reduce((sum, w) => sum + w.estimated_load, 0),
    workouts,
    notes,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}
