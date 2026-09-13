export type BodyFeelId = 'fresco' | 'bien' | 'cargado' | 'roto'
export type MoodId = 'nada' | 'flojas' | 'ganas' | 'full'

export const BODY_FEEL = [
  { id: 'fresco', label: 'Fresco', soreness: 2 },
  { id: 'bien', label: 'Bien', soreness: 4 },
  { id: 'cargado', label: 'Cargado', soreness: 7 },
  { id: 'roto', label: 'Hecho bolsa', soreness: 9 },
] as const satisfies ReadonlyArray<{ id: BodyFeelId; label: string; soreness: number }>

export const MOOD = [
  { id: 'nada', label: 'Nada', motivation: 2 },
  { id: 'flojas', label: 'Flojas', motivation: 4 },
  { id: 'ganas', label: 'Con ganas', motivation: 7 },
  { id: 'full', label: 'A full', motivation: 9 },
] as const satisfies ReadonlyArray<{ id: MoodId; label: string; motivation: number }>

function nearest<T extends { id: string }>(
  value: number | null | undefined,
  options: readonly (T & { score: number })[]
): T['id'] | null {
  if (value == null || !Number.isFinite(value)) return null
  let best = options[0]
  let bestDist = Math.abs(value - best.score)
  for (const option of options) {
    const dist = Math.abs(value - option.score)
    if (dist < bestDist) {
      best = option
      bestDist = dist
    }
  }
  return best.id
}

export function bodyFeelFromSoreness(soreness: number | null | undefined): BodyFeelId | null {
  return nearest(
    soreness,
    BODY_FEEL.map((o) => ({ ...o, score: o.soreness }))
  ) as BodyFeelId | null
}

export function moodFromMotivation(motivation: number | null | undefined): MoodId | null {
  return nearest(
    motivation,
    MOOD.map((o) => ({ ...o, score: o.motivation }))
  ) as MoodId | null
}

export function sorenessFromBody(id: BodyFeelId | null): number | null {
  return BODY_FEEL.find((o) => o.id === id)?.soreness ?? null
}

export function motivationFromMood(id: MoodId | null): number | null {
  return MOOD.find((o) => o.id === id)?.motivation ?? null
}
