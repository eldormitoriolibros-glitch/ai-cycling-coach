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

  it('drops a CSV copy five hours off the Garmin row of the same ride', () => {
    const losers = pickDuplicateLosers([
      row({
        id: 'csv',
        source: 'manual',
        start_time: '2024-04-27T09:46:00.000Z',
        distance_meters: 2300,
        moving_seconds: 660,
        created_at: '2024-08-01T12:00:00.000Z',
      }),
      row({
        id: 'garmin',
        source: 'garmin',
        start_time: '2024-04-27T14:46:00.000Z',
        distance_meters: 2300,
        moving_seconds: 1200,
        created_at: '2026-08-29T12:00:00.000Z',
        sample_count: 400,
      }),
    ])
    expect(losers).toEqual(['csv'])
  })

  it('drops the leftover 100 m Ciclismo sitting next to a real ride', () => {
    const losers = pickDuplicateLosers([
      row({
        id: 'ride',
        source: 'manual',
        start_time: '2024-03-09T07:18:00.000Z',
        distance_meters: 100100,
        moving_seconds: 10980,
      }),
      row({
        id: 'crumb',
        source: 'manual',
        start_time: '2024-03-09T07:10:00.000Z',
        distance_meters: 100,
        moving_seconds: 60,
      }),
    ])
    expect(losers).toEqual(['crumb'])
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

  it('does not treat a short but real second ride as a crumb', () => {
    const losers = pickDuplicateLosers([
      row({
        id: 'long',
        start_time: '2024-05-11T08:10:00.000Z',
        distance_meters: 135000,
      }),
      row({
        id: 'home',
        start_time: '2024-05-11T13:17:00.000Z',
        distance_meters: 17400,
        moving_seconds: 2100,
      }),
    ])
    expect(losers).toEqual([])
  })
})
