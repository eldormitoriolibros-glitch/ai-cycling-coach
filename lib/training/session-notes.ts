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

export function considerationsFor(kind: string | null | undefined): string | null {
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
