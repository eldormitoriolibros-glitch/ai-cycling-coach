# Plan: Trend Tracking & What-If UI

Two features to complete the decision engine: historical power curve snapshots
for trend analysis, and a simple UI for the what-if simulation endpoint.

---

## To-do overview

| # | To-do | File(s) | Depends on |
|---|-------|---------|------------|
| 1 | Store power curve snapshots | `lib/training/snapshot.ts`, migration | — |
| 2 | Load previous curve for trend comparison | `lib/coach/context.ts` | 1 |
| 3 | What-if UI component | `app/coach/what-if-panel.tsx` | — |
| 4 | Wire panel into coach page | `app/coach/page.tsx` | 3 |
| 5 | Type-check + lint | — | all |

---

## To-do 1 — Store power curve snapshots

### Database migration

Create a new table to store periodic snapshots of the power curve:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_power_curve_snapshots.sql

create table power_curve_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  snapshot_date date not null,
  window_days int not null default 90,
  curve jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, snapshot_date, window_days)
);

create index idx_power_curve_snapshots_user_date 
  on power_curve_snapshots(user_id, snapshot_date desc);
```

The `curve` column stores the same structure as `loadPowerSummary().curve`:
```json
[
  { "duration": 5, "power": 980 },
  { "duration": 60, "power": 450 },
  { "duration": 300, "power": 340 },
  { "duration": 1200, "power": 290 },
  { "duration": 3600, "power": 255 }
]
```

### Create `lib/training/snapshot.ts`

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPowerSummary } from './ftp'

/**
 * Saves a snapshot of the current power curve if one doesn't exist
 * for the current week. Called after activity sync.
 */
export async function maybeSaveSnapshot(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  
  // Get current Monday as snapshot date (weekly snapshots)
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  const snapshotDate = monday.toISOString().slice(0, 10)
  
  // Check if snapshot already exists for this week
  const { data: existing } = await supabase
    .from('power_curve_snapshots')
    .select('id')
    .eq('user_id', userId)
    .eq('snapshot_date', snapshotDate)
    .maybeSingle()
  
  if (existing) return false // Already have this week's snapshot
  
  // Load current power curve
  const summary = await loadPowerSummary(userId)
  if (!summary?.curve?.length) return false
  
  // Save snapshot
  const { error } = await supabase
    .from('power_curve_snapshots')
    .insert({
      user_id: userId,
      snapshot_date: snapshotDate,
      window_days: 90,
      curve: summary.curve,
    })
  
  if (error) {
    console.error('Failed to save power curve snapshot:', error.message)
    return false
  }
  
  return true
}

/**
 * Loads the most recent snapshot older than `beforeDate` (default: 90 days ago).
 * Used to compare current curve against a prior period for trend detection.
 */
export async function loadPreviousSnapshot(
  userId: string,
  beforeDate?: string
): Promise<{ duration: number; power: number }[] | null> {
  const supabase = createAdminClient()
  
  const cutoff = beforeDate ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  
  const { data } = await supabase
    .from('power_curve_snapshots')
    .select('curve')
    .eq('user_id', userId)
    .lt('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  
  return (data?.curve as { duration: number; power: number }[]) ?? null
}
```

### Wire into activity sync

**Edit `app/api/strava/webhook/route.ts`.**

After the `recomputeTrainingLoad` call, add:

```ts
import { maybeSaveSnapshot } from '@/lib/training/snapshot'

// Inside the activity sync branch, after recomputeTrainingLoad:
await maybeSaveSnapshot(userId)
```

This ensures a weekly snapshot is saved automatically when activities sync.

---

## To-do 2 — Load previous curve for trend comparison

**Edit `lib/coach/context.ts`.**

### Changes

1. Add import:
   ```ts
   import { loadPreviousSnapshot } from '@/lib/training/snapshot'
   ```

2. After `loadPowerSummary` call, fetch the previous snapshot:
   ```ts
   const previousCurve = await loadPreviousSnapshot(userId)
   ```

3. Update the `buildAthleteProfile` call to pass the previous curve:
   ```ts
   const athleteProfile = buildAthleteProfile(
     powerSummary?.curve ?? [],
     previousCurve
   )
   ```

Now the athlete profile will include trend information (improving/stable/declining)
when a previous snapshot exists.

---

## To-do 3 — What-if UI component

**Create `app/coach/what-if-panel.tsx`.**

A collapsible panel that lets the user simulate schedule changes.

```tsx
'use client'

import { useState } from 'react'

type Scenario = {
  day: number
  label: string
  minutes: number
}

const DAYS = [
  { day: 0, label: 'Dom' },
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mié' },
  { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' },
  { day: 6, label: 'Sáb' },
]

type SimulationResult = {
  draft: {
    workouts: { scheduled_date: string; title: string; duration_minutes: number }[]
    plannedLoad: number
  }
  projection: string[]
}

export function WhatIfPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [projectionDays, setProjectionDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleOverride = (day: number, minutes: number) => {
    setOverrides((prev) => ({ ...prev, [day]: minutes }))
  }

  const handleSimulate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/training/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
          projectionDays,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error en la simulación')
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setOverrides({})
    setResult(null)
    setError(null)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-blue-600 hover:text-blue-800 underline"
      >
        ¿Qué pasa si...?
      </button>
    )
  }

  return (
    <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Simulador: ¿Qué pasa si...?</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Modificá tu disponibilidad para ver cómo cambiaría tu plan y tu forma.
      </p>

      <div className="grid grid-cols-7 gap-2">
        {DAYS.map(({ day, label }) => (
          <div key={day} className="text-center">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <input
              type="number"
              min={0}
              max={300}
              step={15}
              placeholder="min"
              value={overrides[day] ?? ''}
              onChange={(e) => handleOverride(day, parseInt(e.target.value) || 0)}
              className="w-full text-center text-sm border rounded p-1"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm">
          Proyectar a{' '}
          <select
            value={projectionDays}
            onChange={(e) => setProjectionDays(parseInt(e.target.value))}
            className="border rounded px-2 py-1"
          >
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={21}>21 días</option>
          </select>
        </label>

        <button
          onClick={handleSimulate}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Simulando...' : 'Simular'}
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          Reiniciar
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="p-3 bg-white rounded border">
            <div className="font-medium text-sm mb-2">Plan simulado</div>
            {result.draft.workouts.length === 0 ? (
              <p className="text-sm text-gray-500">Sin sesiones programadas</p>
            ) : (
              <ul className="text-sm space-y-1">
                {result.draft.workouts.map((w, i) => (
                  <li key={i}>
                    <span className="text-gray-500">{w.scheduled_date}:</span>{' '}
                    {w.title} ({w.duration_minutes} min)
                  </li>
                ))}
              </ul>
            )}
            <div className="text-xs text-gray-500 mt-2">
              Carga total: {result.draft.plannedLoad} TSS
            </div>
          </div>

          <div className="p-3 bg-white rounded border">
            <div className="font-medium text-sm mb-2">Proyección</div>
            <ul className="text-sm space-y-1">
              {result.projection.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## To-do 4 — Wire panel into coach page

**Edit `app/coach/page.tsx`.**

### Changes

1. Add import at the top:
   ```tsx
   import { WhatIfPanel } from './what-if-panel'
   ```

2. Find an appropriate location in the page layout (e.g., below the chat input
   or in a sidebar) and add:
   ```tsx
   <WhatIfPanel />
   ```

   A good spot is typically after the main chat area, as a collapsible section:
   ```tsx
   <div className="mt-4">
     <WhatIfPanel />
   </div>
   ```

---

## To-do 5 — Type-check + lint

Run:

```bash
npm run type-check
npm run lint
```

Fix any errors. Test the what-if panel locally:
1. Open the coach page
2. Click "¿Qué pasa si...?"
3. Modify availability for a day
4. Click "Simular"
5. Verify the projected plan and load/form projections display correctly

---

## Notes

- **Snapshot frequency:** Weekly (every Monday). This balances storage cost with
  granularity. The 90-day comparison window means trends reflect ~3 months of change.

- **No automatic cleanup:** Old snapshots are kept indefinitely for now. A future
  task could add a retention policy (e.g., keep monthly snapshots older than 1 year).

- **UI is minimal:** The what-if panel is functional but basic. Future iterations
  could add:
  - Preset scenarios ("tomo una semana de descanso", "duplico el volumen")
  - Visual charts for the projection
  - Comparison between current plan and simulated plan
