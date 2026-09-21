/**
 * Lines up the session the coach prescribed with the file the ride produced.
 * Everything here is pure so the chart and the tests read the same numbers.
 */
import {
  resolveSessionKind,
  resolveSessionZone,
} from './session-prescription'
import { blocksForBikeSession, type WorkoutBlock } from './workout-blocks'
import { hrTargetFor, powerTargetFor, zoneColor } from './zones'

export type PlannedWorkout = {
  title: string | null
  workout_type?: string | null
  description: string | null
  duration_minutes: number | null
  target_zone: string | null
  target_power?: number | null
}

export type PlannedRole = 'warmup' | 'work' | 'recovery' | 'steady' | 'cooldown'

export type PlannedSegment = {
  label: string
  role: PlannedRole
  startSeconds: number
  endSeconds: number
  zone: string | null
  color: string
  /** Target band in the comparison metric; `high: null` is open-ended. */
  low: number | null
  high: number | null
  /** True when the length came from the ride because the plan had none. */
  inferredLength?: boolean
}

export type ComparisonMetric = 'power' | 'hr'

export type SegmentResult = {
  segment: PlannedSegment
  actual: number | null
  verdict: 'below' | 'in' | 'above' | 'na'
}

export type PlanComparison = {
  metric: ComparisonMetric
  segments: PlannedSegment[]
  /** One row per prescribed block, recoveries folded away. */
  results: SegmentResult[]
  /** Length of the prescription itself, not where it sits on the ride. */
  plannedSeconds: number
  /** False when the session carried no duration and the ride supplied it. */
  plannedSecondsKnown: boolean
  /** Where the prescription was anchored on the ride clock. */
  offsetSeconds: number
  actualSeconds: number
  /** Share of prescribed key-work time spent inside the target band, 0–100. */
  adherence: number | null
}

export type RidePoint = {
  seconds: number
  power: number | null
  hr: number | null
}

const ROLE_BY_LABEL: Record<string, PlannedRole> = {
  'Entrada en calor': 'warmup',
  Intervalos: 'work',
  'Recuperación entre series': 'recovery',
  'Bloque principal': 'steady',
  'Vuelta a la calma': 'cooldown',
}

/**
 * The prescription as blocks, using the same rules the plan card shows, plus
 * the session zone. Coaches often write "3 bloques de 10 min" and leave the
 * intensity implied by the session, so the zone has to travel with the blocks.
 */
export function plannedPrescription(workout: PlannedWorkout): {
  blocks: WorkoutBlock[]
  zone: string | null
} {
  const kind = resolveSessionKind({
    type: workout.workout_type,
    title: workout.title,
    description: workout.description,
    zone: workout.target_zone,
  })
  if (kind === 'strength') return { blocks: [], zone: null }

  const zone = resolveSessionZone({
    zone: workout.target_zone,
    title: workout.title,
    description: workout.description,
    kind,
  })

  return {
    blocks: blocksForBikeSession({
      description: workout.description,
      minutes: workout.duration_minutes,
      zone,
      kind,
      title: workout.title,
    }),
    zone,
  }
}

export function plannedBlocks(workout: PlannedWorkout): WorkoutBlock[] {
  return plannedPrescription(workout).blocks
}

/**
 * Lays the blocks on a clock. Interval blocks unroll into one segment per
 * repeat with the prescribed recovery in between, which is what the athlete
 * actually rode and what the power file can be checked against.
 */
export function plannedSegments(input: {
  blocks: WorkoutBlock[]
  metric: ComparisonMetric
  ftp: number | null
  maxHr: number | null
  targetPower?: number | null
  /** Session zone, used when a work block does not name its own intensity. */
  fallbackZone?: string | null
  /** Ride length, used to size a block the plan left open-ended. */
  rideSeconds?: number | null
}): PlannedSegment[] {
  const { metric, ftp, maxHr, targetPower, fallbackZone } = input
  const { blocks, inferredIndex } = sizeOpenEndedBlock(input.blocks, input.rideSeconds ?? null)
  const segments: PlannedSegment[] = []
  let cursor = 0

  const zoneFor = (block: WorkoutBlock, role: PlannedRole): string | null => {
    if (block.intensity) return block.intensity
    return role === 'work' || role === 'steady' ? (fallbackZone ?? null) : null
  }

  const push = (
    label: string,
    role: PlannedRole,
    minutes: number | null,
    zone: string | null,
    inferredLength = false
  ) => {
    if (!minutes || minutes <= 0) return
    const band = bandFor({ role, zone, metric, ftp, maxHr, targetPower })
    segments.push({
      label,
      role,
      startSeconds: cursor,
      endSeconds: cursor + minutes * 60,
      zone,
      color: zoneColor(zone),
      low: band?.low ?? null,
      high: band?.high ?? null,
      ...(inferredLength ? { inferredLength } : {}),
    })
    cursor += minutes * 60
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const role = ROLE_BY_LABEL[block.label] ?? 'steady'

    if (role === 'work' && block.repeats && block.repeats > 1 && block.minutes) {
      const next = blocks[i + 1]
      const rest = next && ROLE_BY_LABEL[next.label] === 'recovery' ? next : null
      for (let rep = 0; rep < block.repeats; rep++) {
        push(`Serie ${rep + 1}/${block.repeats}`, 'work', block.minutes, zoneFor(block, 'work'))
        if (rest && rep < block.repeats - 1) {
          push('Recuperación', 'recovery', rest.minutes, rest.intensity)
        }
      }
      if (rest) i++
      continue
    }

    push(block.label, role, block.minutes, zoneFor(block, role), i === inferredIndex)
  }

  return segments
}

/**
 * A session saved without a duration leaves its main block open-ended, and a
 * block with no length would silently disappear from the overlay. The ride is
 * the only length available, so the block is stretched to fill what is left of
 * it: the intensity can still be judged, the duration cannot.
 */
function sizeOpenEndedBlock(
  blocks: WorkoutBlock[],
  rideSeconds: number | null
): { blocks: WorkoutBlock[]; inferredIndex: number } {
  const openIndex = blocks.findIndex((block) => block.minutes == null)
  const stillOpen = blocks.filter((block) => block.minutes == null)
  if (openIndex < 0 || stillOpen.length > 1 || !rideSeconds) {
    return { blocks, inferredIndex: -1 }
  }

  const booked = blocks.reduce(
    (sum, block) => sum + (block.minutes ?? 0) * Math.max(1, block.repeats ?? 1),
    0
  )
  const remaining = Math.round(rideSeconds / 60) - booked
  if (remaining < 5) return { blocks, inferredIndex: -1 }

  return {
    blocks: blocks.map((block, i) => (i === openIndex ? { ...block, minutes: remaining } : block)),
    inferredIndex: openIndex,
  }
}

function bandFor(input: {
  role: PlannedRole
  zone: string | null
  metric: ComparisonMetric
  ftp: number | null
  maxHr: number | null
  targetPower?: number | null
}): { low: number; high: number | null } | null {
  const { role, zone, metric, ftp, maxHr, targetPower } = input

  // An explicit watt target beats the zone it was rounded into.
  if (metric === 'power' && targetPower && (role === 'work' || role === 'steady')) {
    return { low: Math.round(targetPower * 0.96), high: Math.round(targetPower * 1.04) }
  }

  return metric === 'power' ? powerTargetFor(zone, ftp) : hrTargetFor(zone, maxHr)
}

/** True when at least one prescribed block carries a target worth judging. */
export function hasMeasurableWork(segments: PlannedSegment[]): boolean {
  return segments.some(
    (segment) => (segment.role === 'work' || segment.role === 'steady') && segment.low != null
  )
}

/** Which stream can be compared: watts if we can price them, otherwise pulse. */
export function comparisonMetric(input: {
  points: RidePoint[]
  ftp: number | null
  maxHr: number | null
}): ComparisonMetric | null {
  const { points, ftp, maxHr } = input
  if (ftp && points.some((p) => typeof p.power === 'number')) return 'power'
  if (maxHr && points.some((p) => typeof p.hr === 'number')) return 'hr'
  return null
}

export function comparePlan(input: {
  segments: PlannedSegment[]
  points: RidePoint[]
  metric: ComparisonMetric
}): PlanComparison {
  const { segments, points, metric } = input
  const valueOf = (point: RidePoint) => (metric === 'power' ? point.power : point.hr)

  const results: SegmentResult[] = []
  let insideKey = 0
  let totalKey = 0

  for (const segment of segments) {
    const values = points
      .filter((p) => p.seconds >= segment.startSeconds && p.seconds < segment.endSeconds)
      .map(valueOf)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

    const actual = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null

    // Warmups and recoveries are ridden by feel; adherence only judges the
    // part of the session the coach actually prescribed an intensity for.
    if ((segment.role === 'work' || segment.role === 'steady') && segment.low != null) {
      for (const value of values) {
        totalKey++
        if (inBand(value, segment.low, segment.high)) insideKey++
      }
    }

    if (segment.role !== 'recovery') {
      results.push({ segment, actual, verdict: verdictFor(actual, segment) })
    }
  }

  const lastPoint = points.length ? points[points.length - 1].seconds : 0
  const planStart = segments.length ? segments[0].startSeconds : 0
  const planEnd = segments.length ? segments[segments.length - 1].endSeconds : 0

  return {
    metric,
    segments,
    results,
    plannedSeconds: planEnd - planStart,
    plannedSecondsKnown: !segments.some((segment) => segment.inferredLength),
    offsetSeconds: planStart,
    actualSeconds: lastPoint,
    adherence: totalKey > 0 ? Math.round((insideKey / totalKey) * 100) : null,
  }
}

export function shiftSegments(segments: PlannedSegment[], offsetSeconds: number): PlannedSegment[] {
  if (!offsetSeconds) return segments
  return segments.map((segment) => ({
    ...segment,
    startSeconds: segment.startSeconds + offsetSeconds,
    endSeconds: segment.endSeconds + offsetSeconds,
  }))
}

/** First index whose sample is at or after `seconds`. Points are sorted. */
function lowerBound(points: RidePoint[], seconds: number): number {
  let lo = 0
  let hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].seconds < seconds) lo = mid + 1
    else hi = mid
  }
  return lo
}

function alignmentScore(
  segments: PlannedSegment[],
  points: RidePoint[],
  valueOf: (point: RidePoint) => number | null,
  offsetSeconds: number
): { rate: number; matched: number } {
  let inside = 0
  let total = 0

  for (const segment of segments) {
    if (segment.low == null) continue
    const from = lowerBound(points, segment.startSeconds + offsetSeconds)
    const to = lowerBound(points, segment.endSeconds + offsetSeconds)
    for (let i = from; i < to; i++) {
      const value = valueOf(points[i])
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      total++
      if (inBand(value, segment.low, segment.high)) inside++
    }
  }

  return { rate: total > 0 ? inside / total : 0, matched: total }
}

/**
 * Riders roll out, ride to the climb, and only then start the session, so a
 * prescription pinned to second zero lands on the wrong part of the file. The
 * plan is slid along the ride and kept where its whole shape — hard blocks and
 * easy ones alike — matches best, and only when that clearly beats not moving.
 */
export function bestPlanOffset(input: {
  segments: PlannedSegment[]
  points: RidePoint[]
  metric: ComparisonMetric
  stepSeconds?: number
}): number {
  const { segments, points, metric, stepSeconds = 15 } = input
  if (!segments.length || !points.length) return 0

  const valueOf = (point: RidePoint) => (metric === 'power' ? point.power : point.hr)
  const planEnd = segments[segments.length - 1].endSeconds
  const rideEnd = points[points.length - 1].seconds
  const maxOffset = Math.floor(rideEnd - planEnd)
  // Under a minute of slack is not a late start, it is rounding.
  if (maxOffset < 60) return 0

  const banded = segments.filter((segment) => segment.low != null)
  const bandedSeconds = banded.reduce((sum, s) => sum + (s.endSeconds - s.startSeconds), 0)
  const minMatched = bandedSeconds * 0.85

  const base = alignmentScore(segments, points, valueOf, 0)
  let bestOffset = 0
  let bestRate = base.rate

  for (let offset = stepSeconds; offset <= maxOffset; offset += stepSeconds) {
    const score = alignmentScore(segments, points, valueOf, offset)
    if (score.matched < minMatched) continue
    if (score.rate > bestRate) {
      bestRate = score.rate
      bestOffset = offset
    }
  }

  return bestRate > base.rate + 0.05 ? bestOffset : 0
}

function inBand(value: number, low: number, high: number | null): boolean {
  return value >= low && (high == null || value <= high)
}

function verdictFor(actual: number | null, segment: PlannedSegment): SegmentResult['verdict'] {
  if (actual == null || segment.low == null) return 'na'
  if (actual < segment.low) return 'below'
  if (segment.high != null && actual > segment.high) return 'above'
  return 'in'
}
