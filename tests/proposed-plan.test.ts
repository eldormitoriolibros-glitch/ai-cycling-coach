import { describe, expect, it } from 'vitest'
import { pickLastProposedPlan } from '@/lib/coach/proposed-plan'

const PROPOSAL = `Acortamos la bici de hoy.

\`\`\`plan
{"workouts":[{"date":"2026-09-11","type":"endurance","duration_minutes":60,"title":"Z2 suave"}]}
\`\`\``

describe('pickLastProposedPlan', () => {
  it('skips a review that landed after the proposal', () => {
    const plan = pickLastProposedPlan([
      { intent: 'session_review', message: 'Veredicto: como lo prescripto.' },
      { intent: 'chat', message: PROPOSAL },
    ])
    expect(plan?.workouts).toHaveLength(1)
    expect(plan?.workouts[0].duration_minutes).toBe(60)
  })

  it('does not walk past a coach reply without a plan into an older week', () => {
    const olderWeek = `\`\`\`plan
{"workouts":[{"date":"2026-09-07","type":"threshold","duration_minutes":120,"title":"3x10"}]}
\`\`\``
    expect(
      pickLastProposedPlan([
        { intent: 'session_review', message: 'Más largo que lo previsto.' },
        { intent: 'chat', message: 'De una, anotado.' },
        { intent: 'chat', message: olderWeek },
      ])
    ).toBeNull()
  })
})
