import { describe, expect, it } from 'vitest'
import { durationSecondsFromList, listActivityToParsedFit } from '@/lib/garmin/list-import'

describe('listActivityToParsedFit', () => {
  it('maps a Garmin list row into a ParsedFitActivity', () => {
    const parsed = listActivityToParsedFit({
      activityId: 999,
      activityName: 'Rodada matutina',
      startTimeGMT: '2026-08-30T05:45:00.000Z',
      activityType: { typeKey: 'cycling' },
      distance: 42500,
      movingDuration: 5400,
      averageHR: 142,
      elevationGain: 320,
    })

    expect(parsed).toMatchObject({
      garminActivityId: '999',
      title: 'Rodada matutina',
      sportType: 'Ride',
      durationSeconds: 5400,
      distanceMeters: 42500,
      avgHr: 142,
      records: [],
    })
  })

  it('converts millisecond durations when needed', () => {
    expect(durationSecondsFromList({ duration: 3_600_000 })).toBe(3600)
  })

  it('reads Garmin GMT strings without a timezone as UTC', () => {
    const parsed = listActivityToParsedFit({
      activityId: 1,
      activityName: 'Morning Ride',
      startTimeGMT: '2026-08-30 05:45:00',
      movingDuration: 3600,
      distance: 20000,
      activityType: { typeKey: 'cycling' },
    })
    expect(parsed?.startTime).toBe('2026-08-30T05:45:00.000Z')
  })

  it('prefers beginTimestamp when present', () => {
    const parsed = listActivityToParsedFit({
      activityId: 1,
      activityName: 'Morning Ride',
      startTimeGMT: '2026-08-01 00:00:00',
      beginTimestamp: Date.parse('2026-08-30T05:45:00.000Z'),
      movingDuration: 3600,
      distance: 20000,
      activityType: { typeKey: 'cycling' },
    })
    expect(parsed?.startTime).toBe('2026-08-30T05:45:00.000Z')
  })
})
