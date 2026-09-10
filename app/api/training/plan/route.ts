import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeCoachPlan } from '@/lib/training/coach-plan'
import { coachPlanToDraft, commitWeeklyPlan, proposeCyclePlan, proposeWeeklyPlan } from '@/lib/training/plan-service'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const workoutSchema = z.object({
  scheduled_date: isoDate,
  workout_type: z.enum(['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2max', 'strength']),
  title: z.string().min(1).max(120),
  description: z.string().max(1000),
  duration_minutes: z.number().int().min(15).max(600),
  target_zone: z.string().max(20),
  target_power: z.number().int().min(30).max(1000).nullable(),
  target_hr: z.number().int().min(60).max(250).nullable(),
  purpose: z.string().max(500),
  estimated_load: z.number().min(0).max(1000),
})

const draftSchema = z.object({
  startDate: isoDate,
  endDate: isoDate,
  emphasis: z.enum(['recovery', 'maintenance', 'build']),
  blockPosition: z.number().int().min(1).max(8),
  weeklyTargetLoad: z.number().min(0),
  plannedLoad: z.number().min(0),
  workouts: z.array(workoutSchema).max(32),
  notes: z.array(z.string().max(500)).max(40),
})

const coachPlanSchema = z.object({
  emphasis: z.enum(['recovery', 'maintenance', 'build']).optional(),
  workouts: z
    .array(
      z.object({
        date: isoDate,
        type: z.enum(['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2max', 'strength']),
        duration_minutes: z.number().int().min(15).max(600),
        title: z.string().max(200).optional(),
        description: z.string().max(1000).optional(),
        target_zone: z.string().max(20).optional(),
        purpose: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(32),
})

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), startDate: isoDate.optional() }),
  z.object({ action: z.literal('propose_cycle'), startDate: isoDate.optional() }),
  z.object({ action: z.literal('coach_preview'), plan: coachPlanSchema }),
  z.object({
    action: z.literal('commit'),
    draft: draftSchema,
    rationale: z.string().max(2000).nullable(),
  }),
])

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const rawBody = await request.json().catch(() => null)
  const coerced =
    rawBody && typeof rawBody === 'object' && (rawBody as { action?: string }).action === 'coach_preview'
      ? { ...rawBody, plan: normalizeCoachPlan((rawBody as { plan?: unknown }).plan) }
      : rawBody
  const parsed = bodySchema.safeParse(coerced)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      {
        error: first
          ? `No se pudo agendar el plan (${first.path.join('.') || 'datos'}: ${first.message}).`
          : 'Petición inválida.',
      },
      { status: 400 }
    )
  }

  try {
    if (parsed.data.action === 'propose' || parsed.data.action === 'propose_cycle') {
      if (!user.id) {
        return NextResponse.json({ error: 'No se pudo identificar el usuario.' }, { status: 400 })
      }
      return NextResponse.json(
        parsed.data.action === 'propose_cycle'
          ? await proposeCyclePlan(user.id, parsed.data.startDate)
          : await proposeWeeklyPlan(user.id, parsed.data.startDate)
      )
    }

    if (parsed.data.action === 'coach_preview') {
      if (!user.id) {
        return NextResponse.json({ error: 'No se pudo identificar el usuario.' }, { status: 400 })
      }
      return NextResponse.json(await coachPlanToDraft(user.id, parsed.data.plan))
    }

    if (!user.id) {
      return NextResponse.json({ error: 'No se pudo identificar el usuario.' }, { status: 400 })
    }

    const created = await commitWeeklyPlan(user.id, parsed.data.draft, parsed.data.rationale)
    return NextResponse.json({ created })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo procesar el plan.' },
      { status: 500 }
    )
  }
}
