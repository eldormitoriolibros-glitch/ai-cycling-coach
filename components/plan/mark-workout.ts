import { createClient } from '@/lib/supabase/client'
import type { WorkoutStatus } from '@/lib/types/database'

/** How long to wait for the coach before telling the athlete to come back later. */
const REVIEW_WAIT_MS = 120_000
const REVIEW_POLL_MS = 3_000

export async function updateWorkoutStatus(id: string, status: WorkoutStatus): Promise<void> {
  const response = await fetch(`/api/training/workouts/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
    // Survives the phone locking or the athlete leaving the page: the request
    // is short, and the sync it triggers runs on the server either way.
    keepalive: true,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? 'No se pudo actualizar la sesión.')
}

/**
 * Waits for the review the server is writing in the background. Nothing
 * depends on this poll: if the athlete closes the tab the review still lands
 * in Telegram and in the chat.
 */
export async function waitForSessionReview(id: string): Promise<boolean> {
  const supabase = createClient()
  const deadline = Date.now() + REVIEW_WAIT_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, REVIEW_POLL_MS))
    const { data } = await supabase
      .from('workouts')
      .select('review_sent_at')
      .eq('id', id)
      .maybeSingle()
    if (data?.review_sent_at) return true
  }
  return false
}

/** Retry for a session whose ride or review never landed. */
export async function requestSessionReview(id: string): Promise<{ sent: boolean }> {
  try {
    const response = await fetch(`/api/training/workouts/${id}/review`, { method: 'POST' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error ?? 'No se pudo generar la devolución.')
    return { sent: Boolean(body.sent) }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(REVIEW_AFTER_MARK_NOTE)
    }
    throw err
  }
}

export const REVIEW_AFTER_MARK_NOTE =
  'Sesión marcada como hecha. La devolución no salió ahora; pedísela al entrenador en un rato.'

export const REVIEW_STILL_RUNNING_NOTE =
  'Sesión marcada como hecha. El entrenador la sigue analizando: la devolución te llega por Telegram.'
