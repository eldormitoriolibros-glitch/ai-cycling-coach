'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkoutStatus } from '@/lib/types/database'
import { REVIEW_STILL_RUNNING_NOTE, updateWorkoutStatus, waitForSessionReview } from './mark-workout'

export function useWorkoutStatus() {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const setStatus = async (id: string, status: WorkoutStatus) => {
    setError(null)
    setBusyId(id)
    try {
      await updateWorkoutStatus(id, status)
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la sesión.')
      return
    } finally {
      setBusyId(null)
    }

    router.refresh()
    if (status !== 'completed') {
      setSuccess(status === 'skipped' ? 'Sesión saltada.' : 'Sesión actualizada.')
      return
    }

    // The ride pull and the review already run on the server. Waiting here is
    // only so the athlete sees it land; closing the page does not cancel it.
    setSuccess('Sesión marcada. El entrenador está analizándola…')
    const reviewed = await waitForSessionReview(id)
    setSuccess(
      reviewed
        ? 'Listo: el entrenador te mandó la devolución de la sesión.'
        : REVIEW_STILL_RUNNING_NOTE
    )
    router.refresh()
  }

  return { setStatus, busyId, error, success }
}
