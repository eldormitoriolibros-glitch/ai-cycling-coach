import { CollapsibleSection } from './CollapsibleSection'
import { FormStatusChips, FormStatusMeters } from './FormStatusMeters'
import { ReadinessMeter } from './ReadinessMeter'
import { hasDeviceRecovery, type ReadinessResult } from '@/lib/training/readiness'
import type { FormStatus } from '@/lib/training/form-status'
import { describeHowAmI, type TodayPlanState } from '@/lib/training/how-am-i'
import { cn } from '@/lib/utils'

const TONE_TEXT = {
  good: 'text-emerald-600 dark:text-emerald-400',
  ok: 'text-sky-600 dark:text-sky-400',
  low: 'text-amber-600 dark:text-amber-400',
  rest: 'text-red-600 dark:text-red-400',
  empty: 'text-muted',
}

export function HowAmILine({
  readiness,
  status,
  todayPlan = 'pending',
}: {
  readiness: ReadinessResult
  status: FormStatus | null
  todayPlan?: TodayPlanState
}) {
  const line = describeHowAmI(readiness, status?.form ?? null, todayPlan)
  return (
    <div>
      <p className={cn('text-sm font-medium', TONE_TEXT[line.tone])}>{line.headline}</p>
      {line.support ? <p className="mt-0.5 text-xs text-muted">{line.support}</p> : null}
    </div>
  )
}

export function HowAmISection({
  readiness,
  status,
}: {
  readiness: ReadinessResult
  status: FormStatus | null
}) {
  if (!status) return null

  return (
    <CollapsibleSection
      title="Estado de forma"
      summary={
        <FormStatusChips metrics={[status.form, status.fatigue, status.fitness, status.ramp]} />
      }
    >
      <FormStatusMeters
        form={status.form}
        fatigue={status.fatigue}
        fitness={status.fitness}
        ramp={status.ramp}
      />
      {hasDeviceRecovery(readiness) && (
        <div className="mt-4">
          <ReadinessMeter readiness={readiness} />
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        La forma sale de tus salidas. El check-in de la mañana (o el reloj) afina si hoy
        conviene apretar o aflojar. Los números de carga están acá si los querés ver.
      </p>
    </CollapsibleSection>
  )
}
