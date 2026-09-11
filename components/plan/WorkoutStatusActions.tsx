'use client'

import { Button } from '@/components/ui'
import type { WorkoutStatus } from '@/lib/types/database'

export function WorkoutStatusActions({
  workoutId,
  busyId,
  onStatus,
}: {
  workoutId: string
  busyId: string | null
  onStatus: (id: string, status: WorkoutStatus) => void
}) {
  return (
    <>
      <Button
        variant="secondary"
        loading={busyId === workoutId}
        disabled={busyId !== null}
        onClick={() => onStatus(workoutId, 'completed')}
      >
        Hecho
      </Button>
      <Button variant="secondary" disabled={busyId !== null} onClick={() => onStatus(workoutId, 'skipped')}>
        Saltar
      </Button>
    </>
  )
}
