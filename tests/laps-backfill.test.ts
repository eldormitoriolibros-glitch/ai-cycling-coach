import { describe, expect, it } from 'vitest'
import { extractSessionLaps, parseFitDate } from '@/lib/garmin/fit-laps'
import { isCyclingActivity, listedLapCount, matchListedActivity, shouldDownloadLaps, shouldKeepListedRide } from '@/lib/garmin/laps-select'

describe('listedLapCount', () => {
  it('reads lapCount, numberOfActivityLaps, or numeric laps', () => {
    expect(listedLapCount({ lapCount: 6 })).toBe(6)
    expect(listedLapCount({ numberOfActivityLaps: 4 })).toBe(4)
    expect(listedLapCount({ laps: 8 })).toBe(8)
    expect(listedLapCount({ laps: [] })).toBeNull()
  })
})

describe('shouldDownloadLaps', () => {
  it('downloads cycling rides even when Garmin says one lap', () => {
    expect(shouldDownloadLaps({ activityType: { typeKey: 'cycling' }, lapCount: 1 })).toBe(true)
    expect(shouldDownloadLaps({ activityType: { typeKey: 'virtual_ride' } })).toBe(true)
  })

  it('skips walks unless they already report splits', () => {
    expect(shouldDownloadLaps({ activityType: { typeKey: 'walking' }, lapCount: 1 })).toBe(false)
    expect(shouldDownloadLaps({ activityType: { typeKey: 'walking' }, lapCount: 5 })).toBe(true)
  })

  it('detects cycling type keys', () => {
    expect(isCyclingActivity({ activityType: { typeKey: 'gravel_cycling' } })).toBe(true)
    expect(isCyclingActivity({ activityType: { typeKey: 'strength_training' } })).toBe(false)
  })
})

describe('shouldKeepListedRide', () => {
  it('keeps a real bike ride and drops the leftover 100 m file', () => {
    expect(
      shouldKeepListedRide({
        activityId: 1,
        activityName: 'Ciudad de Buenos Aires Ciclismo en ruta',
        startTimeGMT: '2024-03-09 07:18:00',
        activityType: { typeKey: 'cycling' },
        distance: 100100,
        movingDuration: 10980,
      })
    ).toBe(true)
    expect(
      shouldKeepListedRide({
        activityId: 2,
        activityName: 'Ciclismo',
        startTimeGMT: '2024-03-09 07:10:00',
        activityType: { typeKey: 'cycling' },
        distance: 100,
        movingDuration: 60,
      })
    ).toBe(false)
  })

  it('skips strength', () => {
    expect(
      shouldKeepListedRide({
        activityId: 3,
        startTimeGMT: '2024-03-09 07:18:00',
        activityType: { typeKey: 'strength_training' },
        distance: 0,
        movingDuration: 2400,
      })
    ).toBe(false)
  })
})

describe('matchListedActivity', () => {
  it('prefers the garmin- external id and falls back to start time', () => {
    const rows = [
      { id: 'a', external_id: 'garmin-99', start_time: '2026-08-30T10:00:00.000Z' },
      { id: 'b', external_id: 'fit-1', start_time: '2026-08-30T07:00:00.000Z' },
    ]
    expect(matchListedActivity({ activityId: 99 }, rows)?.id).toBe('a')
    expect(
      matchListedActivity({ activityId: 1, startTimeGMT: '2026-08-30 07:02:00' }, rows)?.id
    ).toBe('b')
  })
})

describe('extractSessionLaps', () => {
  it('keeps laps whose start_time is an ISO string, not a Date', () => {
    const laps = extractSessionLaps(
      [
        { start_time: '2026-08-30T07:00:00.000Z', total_elapsed_time: 240, avg_power: 270 },
        { start_time: '2026-08-30T07:04:00.000Z', total_elapsed_time: 180, avg_power: 140 },
      ],
      { start_time: '2026-08-30T07:00:00.000Z', total_elapsed_time: 1800 }
    )
    expect(laps).toHaveLength(2)
    expect(laps[1].startOffsetSeconds).toBe(240)
    expect(laps[0].avgPower).toBe(270)
  })

  it('keeps all laps when they fall outside a broken session window', () => {
    const laps = extractSessionLaps(
      [
        { start_time: '2026-08-30T10:00:00.000Z', total_elapsed_time: 120 },
        { start_time: '2026-08-30T10:02:00.000Z', total_elapsed_time: 120 },
      ],
      { start_time: '2026-08-30T07:00:00.000Z', total_elapsed_time: 60 }
    )
    expect(laps).toHaveLength(2)
  })

  it('parses numeric epoch seconds', () => {
    expect(parseFitDate(1_777_561_200)?.toISOString()).toBe(new Date(1_777_561_200 * 1000).toISOString())
  })
})
