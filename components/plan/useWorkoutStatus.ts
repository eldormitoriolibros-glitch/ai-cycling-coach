'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkoutStatus } from '@/lib/types/database'
import { REVIEW_AFTER_MARK_NOTE, requestSessionReview, updateWorkoutStatus } from './mark-workout'

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
      router.refresh()

      if (status !== 'completed') {
        setSuccess(status === 'skipped' ? 'Sesión saltada.' : 'Sesión actualizada.')
        return
      }

      setSuccess('Sesión marcada. El entrenador está analizándola…')
      try {
        const result = await requestSessionReview(id)
        setSuccess(
          result.sent
            ? 'Listo: el entrenador te mandó la devolución de la sesión.'
            : 'Sesión marcada como hecha.'
        )
      } catch {
        setSuccess(REVIEW_AFTER_MARK_NOTE)
      }
      router.refresh()
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la sesión.')
    } finally {
      setBusyId(null)
    }
  }

  return { setStatus, busyId, error, success }
}
