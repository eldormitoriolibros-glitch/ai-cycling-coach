import { looksGroupRide, parseCompactIntervals } from './session-prescription'

export { looksGroupRide }

const KIND_NOTES: Record<string, string> = {
  recovery:
    'Cadencia alta, plato chico. Si se siente como entrenamiento, estás yendo demasiado fuerte.',
  endurance:
    'Tenés que poder hablar en oraciones. Si el pulso se escapa en las subidas, bajá un cambio.',
  long:
    'Comé desde el arranque y tomá agua cada 15–20 min. El objetivo es terminar fresco, no vacío.',
  tempo:
    'Ritmo sostenido, no un umbral disimulado. Si no podés mantenerlo limpio, acortá el bloque.',
  threshold:
    'Si no sostenés el ritmo, cortá el bloque. No compensés alargando ni empujando el siguiente.',
  vo2max:
    'Los últimos 30 s tienen que costar. Recuperá de verdad entre series; si no, no es VO2.',
  strength:
    'Calidad antes que carga. Espalda neutra, rango completo, sin apnea en el core.',
}

const HARD_WITHOUT_SERIES: Record<string, string> = {
  vo2max:
    'Es un estímulo duro de grupeta o bloque continuo, no series. Sostené el ritmo escrito; no inventes intervalos.',
  threshold:
    'Bloque de calidad sostenida. Si no aguantás el ritmo, recortá; no lo conviertas en series.',
  tempo:
    'Ritmo sostenido y limpio. Si se parte, bajá un cambio en vez de picar.',
}

export function hasIntervalSeries(...texts: Array<string | null | undefined>): boolean {
  const raw = texts.filter(Boolean).join(' ')
  if (!raw.trim()) return false
  if (parseCompactIntervals(raw)) return true
  return (
    /\d+\s*(?:bloques|series|intervalos|repeticiones|pasadas|chispazos|trabajos?)\b/i.test(raw) ||
    /\b\d+\s*[x×]\s*\d+/.test(raw) ||
    /over[\s-]?unders?/i.test(raw)
  )
}

/**
 * Cue that matches how the session is actually ridden. A group ride tagged
 * VO2max must not inherit the "last 30 s / recover between reps" line.
 */
export function considerationsFor(input: {
  kind?: string | null
  title?: string | null
  description?: string | null
}): string | null {
  const kind = input.kind ?? null
  // A grupeta sets its own pace and sometimes includes work. A canned cue
  // either invents rules or tells them not to do series that the group may do.
  if (looksGroupRide(input.title, input.description)) return null
  if (kind && HARD_WITHOUT_SERIES[kind] && !hasIntervalSeries(input.title, input.description)) {
    return HARD_WITHOUT_SERIES[kind]
  }
  if (!kind) return null
  return KIND_NOTES[kind] ?? null
}

export const SESSION_KIND_OPTIONS = [
  { id: 'recovery', label: 'Regenerativo' },
  { id: 'endurance', label: 'Fondo / Z2' },
  { id: 'long', label: 'Salida larga' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'threshold', label: 'Umbral / Z4' },
  { id: 'vo2max', label: 'VO2max' },
  { id: 'strength', label: 'Fuerza' },
] as const
