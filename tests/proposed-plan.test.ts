import { describe, expect, it } from 'vitest'
import {
  pendingPlanMetadata,
  pickLastPendingPlan,
  pickLastProposedPlan,
} from '@/lib/coach/proposed-plan'
import type { CoachPlan } from '@/lib/training/coach-plan'

const PLAN_A: CoachPlan = {
  workouts: [{ date: '2026-09-11', type: 'endurance', duration_minutes: 60, title: 'Z2 suave' }],
}

const PLAN_B: CoachPlan = {
  workouts: [{ date: '2026-09-12', type: 'threshold', duration_minutes: 90, title: '3x10' }],
}

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

  it('keeps a metadata plan across follow-up chat', () => {
    const hit = pickLastPendingPlan([
      { id: 'chat-2', intent: 'chat', message: 'Z2 es 65–75% del FTP.' },
      {
        id: 'plan-1',
        intent: 'proposed_plan',
        message: PROPOSAL,
        metadata: pendingPlanMetadata({ id: 'abc', plan: PLAN_A, status: 'pending' }),
      },
    ])
    expect(hit?.id).toBe('abc')
    expect(hit?.plan.workouts[0].date).toBe('2026-09-11')
  })

  it('does not reuse a plan that was already applied', () => {
    expect(
      pickLastPendingPlan([
        { id: 'ok', intent: 'plan_applied', message: 'Cambio confirmado. Quedó en tu plan: 1 sesión.' },
        {
          id: 'plan-1',
          intent: 'plan_applied',
          message: PROPOSAL,
          metadata: pendingPlanMetadata({ id: 'abc', plan: PLAN_A, status: 'applied' }),
        },
        {
          id: 'plan-old',
          intent: 'proposed_plan',
          message: 'semana vieja',
          metadata: pendingPlanMetadata({ id: 'old', plan: PLAN_B, status: 'pending' }),
        },
      ])
    ).toBeNull()
  })

  it('prefers the newest pending plan when the coach proposed twice', () => {
    const hit = pickLastPendingPlan([
      {
        id: 'plan-b',
        intent: 'proposed_plan',
        message: 'mejor 3x10',
        metadata: pendingPlanMetadata({ id: 'b', plan: PLAN_B, status: 'pending' }),
      },
      {
        id: 'plan-a',
        intent: 'proposed_plan',
        message: PROPOSAL,
        metadata: pendingPlanMetadata({ id: 'a', plan: PLAN_A, status: 'superseded' }),
      },
    ])
    expect(hit?.id).toBe('b')
    expect(hit?.plan.workouts[0].title).toBe('3x10')
  })
})
