'use client'

import { MorningCheckIn } from '@/components/recovery/MorningCheckIn'

/** @deprecated Use MorningCheckIn. Kept so older imports keep working. */
export function RecoveryForm({ today }: { today: string }) {
  return <MorningCheckIn today={today} />
}
