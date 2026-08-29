# Plan: Decision Engine — Athlete Profile, Adaptive Loop, What-If

Three new modules that move physiological intelligence from the LLM into
deterministic, testable code. No database migrations needed — all data already
exists in the current schema.

---

## To-do overview

| # | To-do | File(s) | Depends on |
|---|-------|---------|------------|
| 1 | Athlete profile from power curve | `lib/training/athlete-profile.ts` | — |
| 2 | Readiness score | `lib/training/readiness.ts` | — |
| 3 | Surface profile + readiness in coach context | `lib/coach/context.ts` | 1, 2 |
| 4 | Load projection (Banister forward model) | `lib/training/projection.ts` | — |
| 5 | Adaptive replan check | `lib/training/replan.ts` | — |
| 6 | Wire replan into post-sync webhook | `app/api/strava/webhook/route.ts` | 5 |
| 7 | What-if simulate endpoint | `app/api/training/simulate/route.ts` | 4 |
| 8 | Coach rules update | `lib/coach/index.ts` | 3 |
| 9 | Type-check + lint | — | all |

---

## To-do 1 — Athlete profile from power curve

**Create `lib/training/athlete-profile.ts`.**

Pure functions only — no database, no `server-only`.

### Types

```ts
export type AthleteProfile = {
  /** Best 5-second power (watts). Proxy for neuromuscular power. */
  sprintPower: number | null
  /** Best 1-minute power (watts). Proxy for anaerobic capacity. */
  anaerobicPower: number | null
  /** Best 5-minute power (watts). Proxy for VO2max. */
  vo2maxPower: number | null
  /** Best 20-minute power (watts). FTP proxy. */
  thresholdPower: number | null
  /** Best 60-minute power (watts). Endurance ceiling. */
  endurancePower: number | null
  /** vo2maxPower / thresholdPower. > 1.15 = explosive, < 1.05 = diesel. */
  anaerobicReserveRatio: number | null
  /** endurancePower / thresholdPower. > 0.85 = strong endurance. */
  enduranceRatio: number | null
  /** Plain-text phenotype: 'sprinter', 'all-rounder', 'diesel', or null. */
  phenotype: string | null
  /** Per-dimension trend: 'improving', 'stable', 'declining', or null. */
  trends: {
    sprint: string | null
    anaerobic: string | null
    vo2max: string | null
    threshold: string | null
    endurance: string | null
  }
}
```

### Function: `buildAthleteProfile`

```ts
import type { CurvePoint } from './ftp'

export function buildAthleteProfile(
  currentCurve: CurvePoint[],
  previousCurve: CurvePoint[] | null
): AthleteProfile
```

**Logic:**

1. Read from `currentCurve` (the array returned by `loadPowerSummary().curve`).
   Map each `CurvePoint` by its `duration` field:
   - `5` → `sprintPower`
   - `60` → `anaerobicPower`
   - `300` → `vo2maxPower`
   - `1200` → `thresholdPower`
   - `3600` → `endurancePower`
   Set to `null` if the duration is missing from the curve.

2. Compute ratios:
   - `anaerobicReserveRatio = vo2maxPower / thresholdPower` (null if either is null)
   - `enduranceRatio = endurancePower / thresholdPower` (null if either is null)

3. Derive `phenotype`:
   - If `anaerobicReserveRatio > 1.15`: `'sprinter'`
   - If `enduranceRatio > 0.82 && anaerobicReserveRatio < 1.08`: `'diesel'`
   - If both ratios exist: `'all-rounder'`
   - Otherwise: `null`

4. Compute `trends` by comparing `currentCurve` to `previousCurve` (which
   would be the curve from a *prior* 90-day window, or null if unavailable).
   For each dimension, if both values exist:
   - delta > +3%: `'improving'`
   - delta < -3%: `'declining'`
   - else: `'stable'`
   If `previousCurve` is null, all trends are null.

### Function: `formatAthleteProfile`

```ts
export function formatAthleteProfile(profile: AthleteProfile): string[]
```

Returns an array of plain-text lines for the coach context. Example output:

```
sprint 5s: 980 W · anaeróbico 1min: 450 W · VO2max 5min: 340 W · umbral 20min: 290 W · fondo 60min: 255 W
reserva anaeróbica: 1.17 · ratio fondo: 0.88 · fenotipo: sprinter
tendencias (vs período anterior): sprint estable · VO2max mejorando · umbral estable · fondo declinando
```

If a value is null, omit it from the line. If no power data exists at all,
return `['sin datos de potencia suficientes para armar perfil']`.

### JSDoc example

Add a `@example` block on `buildAthleteProfile` showing input → output for
at least one case with all five durations present.

---

## To-do 2 — Readiness score

**Create `lib/training/readiness.ts`.**

Pure functions only — no database, no `server-only`.

### Types

```ts
export type ReadinessInput = {
  form: number | null
  restingHr: number | null
  baselineRestingHr: number | null
  hrv: number | null
  baselineHrv: number | null
  sleepHours: number | null
  sleepScore: number | null
  soreness: number | null
  motivation: number | null
}

export type ReadinessResult = {
  /** 0–100 score. >70 = green, 40–70 = amber, <40 = red. */
  score: number
  /** Short human-readable label. */
  label: string
  /** Factors that dragged the score down, if any. */
  flags: string[]
}
```

### Function: `computeReadiness`

```ts
export function computeReadiness(input: ReadinessInput): ReadinessResult
```

**Logic — weighted average with penalty flags:**

Start from a base of 60. Then adjust:

| Signal | Weight | Adjustment |
|--------|--------|------------|
| `form` (TSB) | 30% | Map [-30..+20] → [0..100], clamp. Score = mapped × 0.30 |
| `sleepHours` | 15% | Map [4..9] → [0..100]. Score = mapped × 0.15 |
| `sleepScore` | 10% | Direct 0–100 → × 0.10 |
| `hrv` vs baseline | 15% | If hrv/baselineHrv < 0.85 → penalty. Ratio [0.7..1.2] → [0..100] × 0.15 |
| `restingHr` vs baseline | 10% | If resting/baseline > 1.10 → penalty. Inverse ratio × 0.10 |
| `soreness` | 10% | Map [10..1] → [0..100] (10=worst → 0, 1=fresh → 100) × 0.10 |
| `motivation` | 10% | Map [1..10] → [0..100] × 0.10 |

If a signal is null, redistribute its weight equally among non-null signals.

After computing the weighted score (0–100):
- `>= 70`: label = `'Listo para entrenar fuerte'`
- `>= 50`: label = `'Aceptable, podés entrenar con moderación'`
- `>= 35`: label = `'Cargado, mejor bajar la intensidad'`
- `< 35`: label = `'Necesitás descanso'`

Flags (append to `flags` array when true):
- `'sueño corto'` if `sleepHours < 6`
- `'FC reposo elevada'` if `restingHr / baselineRestingHr > 1.10`
- `'HRV baja'` if `hrv / baselineHrv < 0.85`
- `'dolor alto'` if `soreness >= 7`
- `'forma muy negativa'` if `form < -25`

### Function: `formatReadiness`

```ts
export function formatReadiness(result: ReadinessResult): string[]
```

Returns lines like:
```
readiness: 72/100 · Listo para entrenar fuerte
```
Or if flags exist:
```
readiness: 38/100 · Necesitás descanso · alertas: sueño corto, HRV baja
```

---

## To-do 3 — Surface profile + readiness in coach context

**Edit `lib/coach/context.ts`.**

### Changes

1. Add imports at the top:
   ```ts
   import { buildAthleteProfile, formatAthleteProfile } from '@/lib/training/athlete-profile'
   import { computeReadiness, formatReadiness } from '@/lib/training/readiness'
   ```

2. After the `powerSummary` variable is assigned (around line 67), add:
   ```ts
   const athleteProfile = buildAthleteProfile(powerSummary?.curve ?? [], null)
   ```
   Note: pass `null` as `previousCurve` for now — trend tracking is a later
   iteration that will require storing a snapshot of the prior window.

3. Add a new query inside the existing `Promise.all` to fetch the 7-day
   average of `resting_hr` and `hrv` for the baseline:
   ```ts
   const baselineQuery = supabase
     .from('recovery_metrics')
     .select('resting_hr, hrv')
     .eq('user_id', userId)
     .order('date', { ascending: false })
     .limit(30)
   ```
   *Alternatively*, compute the baseline inline from the existing `recovery`
   query data (which already fetches 7 days). The "baseline" can be the
   median of the last 30 days. If adding a new query to the `Promise.all`
   array, add it at the end and destructure accordingly.

4. After computing `todayIso`, build the readiness input from the latest
   recovery + sleep row:
   ```ts
   const latestRecovery = recovery.data?.[0]
   const latestSleep = sleep.data?.[0]
   const readiness = computeReadiness({
     form: load?.[0]?.form ?? null,
     restingHr: latestRecovery?.resting_hr ?? null,
     baselineRestingHr: /* median of last 30 days resting_hr */ null,
     hrv: latestRecovery?.hrv ?? null,
     baselineHrv: /* median of last 30 days HRV */ null,
     sleepHours: latestSleep?.duration_minutes ? latestSleep.duration_minutes / 60 : null,
     sleepScore: latestSleep?.sleep_score ?? null,
     soreness: latestRecovery?.soreness ?? null,
     motivation: latestRecovery?.motivation ?? null,
   })
   ```
   For the baseline fields: if the extra 30-day query is added, compute the
   median from its results. If not, pass `null` — the readiness function
   handles null inputs by redistributing weight.

5. Insert two new sections in the output, **before** the `## Prescripto vs ejecutado` section:

   ```ts
   lines.push('')
   lines.push('## Perfil del atleta (derivado de la curva de potencia, 90 días)')
   lines.push(...formatAthleteProfile(athleteProfile))

   lines.push('')
   lines.push('## Readiness (hoy)')
   lines.push(...formatReadiness(readiness))
   ```

---

## To-do 4 — Load projection (Banister forward model)

**Create `lib/training/projection.ts`.**

Pure functions only — no database, no `server-only`.

### Function: `projectLoad`

```ts
import type { DailyLoadPoint } from './rollup'

export type ProjectionScenario = {
  /** Label for display, e.g. 'descanso completo', 'plan actual'. */
  label: string
  /** Assumed daily load for each projected day. */
  dailyLoads: number[]
}

export type ProjectedPoint = {
  date: string
  chronic_load: number
  acute_load: number
  form: number
}

export function projectLoad(
  lastPoint: DailyLoadPoint,
  days: number,
  dailyLoads: number[]
): ProjectedPoint[]
```

**Logic:**

Use the same Banister constants from `rollup.ts` (42 / 7):

```ts
const CHRONIC_DAYS = 42
const ACUTE_DAYS = 7
```

Starting from `lastPoint.chronic_load` and `lastPoint.acute_load`, iterate
`days` forward. For each day `i`:

```
load = dailyLoads[i] ?? 0
chronic += (load - chronic) / CHRONIC_DAYS
acute += (load - acute) / ACUTE_DAYS
form = chronic - acute
```

Push each day's result to the output array. Use `addDays(lastPoint.date, i + 1)`
for the date.

### Function: `formatProjection`

```ts
export function formatProjection(scenarios: { label: string; points: ProjectedPoint[] }[]): string[]
```

For each scenario, show the final day's values:

```
proyección a 7 días (descanso completo): fitness 52 · fatiga 18 · forma +34
proyección a 7 días (plan actual): fitness 54 · fatiga 38 · forma +16
```

---

## To-do 5 — Adaptive replan check

**Create `lib/training/replan.ts`.**

Imports `server-only` — this module reads the database.

### Types

```ts
export type ReplanVerdict = {
  shouldReplan: boolean
  reasons: string[]
  remainingWorkouts: number
  loadDeficit: number
  loadSurplus: number
}
```

### Function: `checkReplan`

```ts
import 'server-only'

export async function checkReplan(userId: string): Promise<ReplanVerdict>
```

**Logic:**

1. Fetch the current plan week:
   ```ts
   const { data: planWeek } = await supabase
     .from('plan_weeks')
     .select('start_date, end_date, target_load, planned_load, emphasis')
     .eq('user_id', userId)
     .order('start_date', { ascending: false })
     .limit(1)
     .maybeSingle()
   ```
   If no plan week exists, return `{ shouldReplan: false, reasons: [], remainingWorkouts: 0, loadDeficit: 0, loadSurplus: 0 }`.

2. Check if today is within the plan week's date range. If today > end_date,
   return `shouldReplan: false` (the plan is complete).

3. Fetch remaining scheduled workouts in this plan week:
   ```ts
   const { data: remaining } = await supabase
     .from('workouts')
     .select('scheduled_date, workout_type, duration_minutes, estimated_load, status')
     .eq('user_id', userId)
     .eq('status', 'scheduled')
     .gte('scheduled_date', today)
     .lte('scheduled_date', planWeek.end_date)
   ```

4. Fetch completed/skipped workouts from the start of this plan week to today:
   ```ts
   const { data: past } = await supabase
     .from('workouts')
     .select('status, estimated_load')
     .eq('user_id', userId)
     .gte('scheduled_date', planWeek.start_date)
     .lt('scheduled_date', today)
   ```

5. Compute:
   - `completedLoad` = sum of `estimated_load` where `status === 'completed'`
   - `skippedLoad` = sum of `estimated_load` where `status === 'skipped'`
   - `remainingPlannedLoad` = sum of remaining workouts' `estimated_load`
   - `loadDeficit` = `skippedLoad` (load that was planned but not executed)
   - `loadSurplus` = any surplus from unplanned rides (not computed here, set to 0)

6. Determine `shouldReplan`:
   - `true` if `skippedLoad / planWeek.target_load > 0.20` (missed > 20% of weekly target)
   - `true` if there are 0 remaining workouts but we're not at the end of the week
   - `false` otherwise

7. Build `reasons` array:
   - If skipped > 20%: `'Se perdió más del 20% de la carga semanal'`
   - If 0 remaining: `'No quedan sesiones programadas para el resto de la semana'`

Return the `ReplanVerdict`.

This module does **not** actually replan — it only answers "should we?". The
actual replanning is done by calling `buildWeeklyPlan()` with updated inputs,
which is handled by the webhook integration (to-do 6).

---

## To-do 6 — Wire replan into post-sync webhook

**Edit `app/api/strava/webhook/route.ts`.**

### Changes

After the `syncSingleActivity` call succeeds (around line 60), add:

```ts
import { checkReplan } from '@/lib/training/replan'
import { reconcileWorkouts } from '@/lib/training/reconcile'

// ... inside the activity sync branch, after syncSingleActivity:
await reconcileWorkouts(userId)
const verdict = await checkReplan(userId)
if (verdict.shouldReplan) {
  console.log(`Replan recommended for ${userId}:`, verdict.reasons)
  // For now, just log. Phase 2 will auto-propose via Telegram.
}
```

**Important:** The webhook must still return 200 within 2 seconds (Strava
requirement). The `reconcileWorkouts` + `checkReplan` calls are lightweight
DB queries, not AI calls, so they should fit within the window. If they
don't, wrap them in a fire-and-forget pattern.

Do NOT add the `reconcileWorkouts` import if it's already imported. Check first.

---

## To-do 7 — What-if simulate endpoint

**Create `app/api/training/simulate/route.ts`.**

### Route: POST `/api/training/simulate`

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildWeeklyPlan } from '@/lib/training/planner'
import { projectLoad } from '@/lib/training/projection'
import type { DailyLoadPoint } from '@/lib/training/rollup'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** Override availability for specific days (0=Sun..6=Sat). */
  availabilityOverrides: z.record(
    z.string().regex(/^[0-6]$/),
    z.number().int().min(0).max(600)
  ).optional(),
  /** Project load forward N days (default 7, max 28). */
  projectionDays: z.number().int().min(1).max(28).default(7),
})
```

**Logic:**

1. Authenticate the user.
2. Fetch the same inputs that `proposeWeeklyPlan` uses (profile, metrics,
   availability, latest load point, loading weeks count).
3. If `availabilityOverrides` is provided, merge them into the availability
   array (override `bike_minutes` for the specified day_of_week).
4. Call `buildWeeklyPlan()` with the (possibly modified) inputs.
5. Call `projectLoad()` twice:
   - Scenario A (`'plan simulado'`): using the drafted workouts' estimated loads
   - Scenario B (`'descanso completo'`): all zeros
6. Return: `{ draft, projection: { plan: scenarioA, rest: scenarioB } }`

Do NOT commit anything. This is a read-only simulation.

---

## To-do 8 — Coach rules update

**Edit `lib/coach/index.ts`.**

### Changes to RULES string

Append three new rules after rule 15:

```
16. El contexto ahora incluye "Perfil del atleta" con potencias por duración, ratios y fenotipo. Usalo para orientar la prescripción: si el ratio de fondo es bajo, priorizá trabajo aeróbico; si la reserva anaeróbica es baja, incluí VO2max. Mencioná las fortalezas y debilidades cuando expliques por qué elegís una sesión.
17. El contexto incluye "Readiness (hoy)" con un puntaje de 0 a 100 y alertas. Si el readiness es < 40, no prescribas sesiones de alta intensidad sin consultarlo con el atleta. Si hay alertas (sueño corto, FC elevada, HRV baja), mencionálas.
18. Cuando el atleta pregunte "qué pasa si..." (descanso, cambio de disponibilidad, salida larga), explicá cómo cambiaría su plan y su forma en los próximos días. Si tenés la proyección en el contexto, usala.
```

---

## To-do 9 — Type-check + lint

Run:

```bash
npm run type-check
npm run lint
```

Fix any errors introduced by the new code. Spot-check that the new context
sections appear in the expected format by reading through the pure functions'
outputs mentally against the JSDoc examples.

---

## What this plan does NOT do (deferred)

- **Automatic replanning via Telegram.** To-do 6 logs a verdict but does not
  send a message or auto-propose. Phase 2 will use `buildDailyNudge`-style
  logic to propose a revised plan.
- **Trend tracking.** The athlete profile accepts a `previousCurve` parameter
  but we pass `null` for now. Storing periodic snapshots is a future step.
- **Readiness in the planner.** The readiness score is surfaced to the LLM
  but not wired into `buildWeeklyPlan()`. That requires changing the
  `PlannerInput` type, which is a separate PR.
- **UI for simulation.** The endpoint exists for the coach to call (and
  eventually for a "what-if" UI), but no frontend is built.
