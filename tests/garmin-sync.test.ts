import { describe, expect, it } from 'vitest'
import {
  capFitDownloads,
  garminActivityId,
  planListedRideFit,
  selectActivitiesForIncrementalSync,
} from '@/lib/garmin/incremental-sync'

describe('selectActivitiesForIncrementalSync', () => {
  const now = new Date('2026-08-30T16:00:00.000Z')

  it('skips activities already stored as garmin source', () => {
    const activities = [{ activityId: 111, startTimeGMT: '2026-08-30T10:00:00.000Z' }]
    const picked = selectActivitiesForIncrementalSync(activities, new Set(['111']), { now })
    expect(picked).toHaveLength(0)
  })

  it('includes new activities even if last sync was after the ride start', () => {
    const activities = [{ activityId: 222, startTimeGMT: '2026-08-30T08:00:00.000Z' }]
    const picked = selectActivitiesForIncrementalSync(activities, new Set(), { now })
    expect(picked).toHaveLength(1)
    expect(garminActivityId(picked[0])).toBe('222')
  })

  it('treats Garmin GMT without timezone as recent UTC', () => {
    const activities = [{ activityId: 444, startTimeGMT: '2026-08-30 08:00:00' }]
    const picked = selectActivitiesForIncrementalSync(activities, new Set(), { now })
    expect(picked).toHaveLength(1)
  })

  it('ignores activities older than the lookback window', () => {
    const activities = [{ activityId: 333, startTimeGMT: '2026-06-01T08:00:00.000Z' }]
    const picked = selectActivitiesForIncrementalSync(activities, new Set(), { now, lookbackDays: 21 })
    expect(picked).toHaveLength(0)
  })
})

describe('planListedRideFit', () => {
  it('still downloads the FIT when a Strava copy already exists without splits', () => {
    expect(
      planListedRideFit({
        storedGarmin: false,
        storedTimeOk: false,
        matchedExisting: true,
        existingHasSplits: false,
      })
    ).toBe('download')
  })

  it('skips the FIT when that copy already has splits', () => {
    expect(
      planListedRideFit({
        storedGarmin: false,
        storedTimeOk: false,
        matchedExisting: true,
        existingHasSplits: true,
      })
    ).toBe('skip')
  })

  it('re-downloads a stored Garmin ride that never got laps', () => {
    expect(
      planListedRideFit({
        storedGarmin: true,
        storedTimeOk: true,
        matchedExisting: false,
        existingHasSplits: false,
      })
    ).toBe('download')
  })
})

describe('capFitDownloads', () => {
  it('keeps the newest rides when the FIT queue is capped', () => {
    const picked = capFitDownloads(
      [
        { activityId: 1, startTimeGMT: '2026-09-10T10:00:00.000Z' },
        { activityId: 2, startTimeGMT: '2026-09-18T21:00:00.000Z' },
        { activityId: 3, startTimeGMT: '2026-09-16T06:00:00.000Z' },
      ],
      2
    )
    expect(picked.map((row) => garminActivityId(row))).toEqual(['2', '3'])
  })
})
