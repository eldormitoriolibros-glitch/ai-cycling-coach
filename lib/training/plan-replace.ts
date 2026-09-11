import { looksStrength } from './split-sessions'

export type ReplaceableSession = {
  id: string
  scheduled_date: string
  workout_type: string | null
  title: string | null
  status: string
}

export type IncomingSession = {
  scheduled_date: string
  workout_type: string | null
  title: string | null
}

export function workoutSlot(workout: {
  workout_type?: string | null
  title?: string | null
}): 'bike' | 'strength' {
  return looksStrength(workout.title, workout.workout_type) ? 'strength' : 'bike'
}

/**
 * A Telegram change usually sends only the affected bike (or strength) session.
 * Replacing every scheduled row in the date window would drop the other kind
 * on that day — e.g. shortening today's ride deleted fuerza.
 */
export function scheduledIdsToReplace(
  existing: ReplaceableSession[],
  incoming: IncomingSession[]
): string[] {
  const slotsByDate = new Map<string, Set<'bike' | 'strength'>>()
  for (const workout of incoming) {
    const slots = slotsByDate.get(workout.scheduled_date) ?? new Set()
    slots.add(workoutSlot(workout))
    slotsByDate.set(workout.scheduled_date, slots)
  }

  return existing
    .filter((workout) => workout.status === 'scheduled')
    .filter((workout) => slotsByDate.get(workout.scheduled_date)?.has(workoutSlot(workout)))
    .map((workout) => workout.id)
}
