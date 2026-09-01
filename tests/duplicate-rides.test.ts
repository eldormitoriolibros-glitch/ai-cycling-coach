import { describe, expect, it } from 'vitest'
import { pickDuplicateLosers, type DuplicateCandidate } from '@/lib/training/duplicate-rides'

function row(partial: Partial<DuplicateCandidate> & { id: string; start_time: string }): DuplicateCandidate {
  return {
    source: 'strava',
    distance_meters: 39000,
    moving_seconds: 5400,
    duration_seconds: 5400,
    created_at: '2026-08-10T12:00:00.000Z',
    ...partial,
  }
}

describe('pickDuplicateLosers', () => {
  it('drops the newer Garmin copy of an existing Strava ride', () => {
    const losers = pickDuplicateLosers([
      row({
        id: 'original',
        source: 'strava',
        start_time: '2026-08-18T17:00:00.000Z',
        created_at: '2026-08-18T20:00:00.000Z',
        sample_count: 2000,
      }),
      row({
        id: 'copy',
        source: 'garmin',
        start_time: '2026-08-18T17:02:00.000Z',
        created_at: '2026-08-30T17:00:00.000Z',
      }),
    ])
    expect(losers).toEqual(['copy'])
  })

  it('drops a Garmin copy even if the start time is a few hours off', () => {
    const losers = pickDuplicateLosers([
      row({
        id: 'original',
        source: 'strava',
        start_time: '2026-08-30T10:45:00.000Z',
        created_at: '2026-08-30T12:00:00.000Z',
        sample_count: 1000,
      }),
      row({
        id: 'copy',
        source: 'garmin',
        start_time: '2026-08-30T07:45:00.000Z',
        created_at: '2026-08-30T18:00:00.000Z',
      }),
    ])
    expect(losers).toEqual(['copy'])
  })

  it('keeps two distinct rides on the same day', () => {
    const losers = pickDuplicateLosers([
      row({
        id: 'morning',
        start_time: '2026-08-30T08:00:00.000Z',
        distance_meters: 40000,
      }),
      row({
        id: 'afternoon',
        start_time: '2026-08-30T16:00:00.000Z',
        distance_meters: 25000,
      }),
    ])
    expect(losers).toEqual([])
  })
})
