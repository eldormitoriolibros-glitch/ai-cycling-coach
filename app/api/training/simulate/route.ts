import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildWeeklyPlan } from '@/lib/training/planner2'
import { projectLoad, formatProjection } from '@/lib/training/projection'
import { addDays, localDateKey } from '@/lib/training/dates'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  availabilityOverrides: z.record(z.string().regex(/^[0-6]$/), z.number().int().min(0).max(600)).optional(),
  projectionDays: z.number().int().min(1).max(28).optional().default(7),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })

  const admin = createAdminClient()
  try {
    // load inputs similar to proposeWeeklyPlan
    const [{ data: profile }, { data: metrics }, { data: availability }, { data: load }] =
      await Promise.all([
        admin.from('users').select('timezone, experience_level').eq('id', user.id).maybeSingle(),
        admin.from('athlete_metrics').select('ftp, max_hr').eq('user_id', user.id).maybeSingle(),
        admin.from('availability').select('day_of_week, bike_minutes, strength_minutes').eq('user_id', user.id).gt('bike_minutes', 0),
        admin.from('training_load').select('date, daily_load, chronic_load, form').eq('user_id', user.id).order('date', { ascending: false }).limit(1).maybeSingle(),
      ])

    const timeZone = profile?.timezone || 'UTC'
    const start = parsed.data.startDate ?? new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(Date.now() + 86_400_000))

    // apply availability overrides if provided
    const avail = (availability ?? []).map((a: any) => ({ ...a }))
    if (parsed.data.availabilityOverrides) {
      for (const [dowStr, minutes] of Object.entries(parsed.data.availabilityOverrides)) {
        const dow = Number(dowStr)
        const idx = avail.findIndex((x: any) => x.day_of_week === dow)
        if (idx >= 0) avail[idx].bike_minutes = minutes
        else avail.push({ user_id: user.id, day_of_week: dow, bike_minutes: minutes, strength_minutes: 0 })
      }
    }

    const draft = buildWeeklyPlan({
      startDate: start,
      availability: avail ?? [],
      ftp: metrics?.ftp ?? null,
      maxHr: metrics?.max_hr ?? null,
      chronicLoad: load?.chronic_load ?? null,
      form: load?.form ?? null,
      experience: profile?.experience_level ?? null,
      loadingWeeksInBlock: 0,
    })

    // projection input: find last training_load point as starting point
    const { data: lastPointRow } = await admin
      .from('training_load')
      .select('date, daily_load, chronic_load, acute_load, form, ramp_rate')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastPoint = lastPointRow

    const projectionDays = parsed.data.projectionDays ?? 7
    const scenarios: { label: string; points: any[] }[] = []
    if (lastPoint) {
      // build dailyLoads for the plan draft across projectionDays
      const dailyMap = new Map<string, number>()
      for (const w of draft.workouts) {
        dailyMap.set(w.scheduled_date, (dailyMap.get(w.scheduled_date) ?? 0) + (w.estimated_load ?? 0))
      }
      const startDate = lastPoint.date
      const dailyLoadsPlan: number[] = []
      for (let i = 0; i < projectionDays; i++) {
        const d = addDays(startDate, i + 1)
        dailyLoadsPlan.push(dailyMap.get(d) ?? 0)
      }
      // Convert to DailyLoadPoint with non-null defaults
      const loadPoint = {
        date: lastPoint.date,
        daily_load: lastPoint.daily_load ?? 0,
        chronic_load: lastPoint.chronic_load ?? 0,
        acute_load: lastPoint.acute_load ?? 0,
        form: lastPoint.form ?? 0,
        ramp_rate: lastPoint.ramp_rate,
      }
      const planPoints = projectLoad(loadPoint, projectionDays, dailyLoadsPlan)
      const restPoints = projectLoad(loadPoint, projectionDays, Array(projectionDays).fill(0))
      scenarios.push({ label: 'plan simulado', points: planPoints })
      scenarios.push({ label: 'descanso completo', points: restPoints })
    }

    return NextResponse.json({
      draft,
      projection: formatProjection(scenarios as any),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 })
  }
}

