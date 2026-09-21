import { describe, expect, it } from 'vitest'
import { computeDecoupling, decouplingVerdict, type DecouplingSample } from '@/lib/training/decoupling'

/** Per-second ride where each half can hold its own power and HR. */
function ride(input: {
  minutes: number
  power: (minute: number) => number | null
  hr: (minute: number) => number | null
}): DecouplingSample[] {
  const samples: DecouplingSample[] = []
  for (let second = 0; second < input.minutes * 60; second++) {
    const minute = Math.floor(second / 60)
    samples.push({
      offset_seconds: second,
      power: input.power(minute),
      heart_rate: input.hr(minute),
    })
  }
  return samples
}

const FTP = 250

describe('computeDecoupling', () => {
  it('calls a rock-steady endurance ride solid', () => {
    const outcome = computeDecoupling({
      samples: ride({ minutes: 120, power: () => 160, hr: () => 130 }),
      ftp: FTP,
    })

    if ('skip' in outcome) throw new Error(`expected a result, got ${outcome.skip}`)
    expect(outcome.result.percent).toBe(0)
    expect(outcome.result.verdict).toBe('solid')
    expect(outcome.result.first.power).toBe(160)
    expect(outcome.result.first.hr).toBe(130)
  })

  it('flags cardiac drift when heart rate climbs at the same power', () => {
    // Same 160 W all ride, but HR walks from 130 to ~143 in the back half.
    const outcome = computeDecoupling({
      samples: ride({
        minutes: 120,
        power: () => 160,
        hr: (minute) => (minute < 65 ? 130 : 143),
      }),
      ftp: FTP,
    })

    if ('skip' in outcome) throw new Error(`expected a result, got ${outcome.skip}`)
    expect(outcome.result.percent).toBeGreaterThan(8)
    expect(outcome.result.verdict).toBe('faded')
  })

  it('reads a power fade at a pinned heart rate as decoupling too', () => {
    const outcome = computeDecoupling({
      samples: ride({
        minutes: 120,
        power: (minute) => (minute < 65 ? 170 : 159),
        hr: () => 135,
      }),
      ftp: FTP,
    })

    if ('skip' in outcome) throw new Error(`expected a result, got ${outcome.skip}`)
    expect(outcome.result.percent).toBeGreaterThan(5)
  })

  it('skips the warmup so the initial heart-rate lag does not fake a drift', () => {
    // First 10 min at a low HR; if counted, the first half ratio would be
    // inflated and the ride would look decoupled.
    const outcome = computeDecoupling({
      samples: ride({
        minutes: 120,
        power: () => 160,
        hr: (minute) => (minute < 10 ? 95 : 132),
      }),
      ftp: FTP,
    })

    if ('skip' in outcome) throw new Error(`expected a result, got ${outcome.skip}`)
    expect(outcome.result.percent).toBe(0)
    expect(outcome.result.analyzedSeconds).toBeCloseTo(110 * 60, -1)
  })

  it('stays quiet on an interval session, where the number means nothing', () => {
    const outcome = computeDecoupling({
      samples: ride({
        minutes: 120,
        power: (minute) => (minute % 4 < 2 ? 290 : 120),
        hr: (minute) => (minute % 4 < 2 ? 170 : 130),
      }),
      ftp: FTP,
    })

    expect(outcome).toEqual({ skip: 'too-hard' })
  })

  it('judges a ride recorded every few seconds by elapsed time, not sample count', () => {
    // Garmin smart recording: 2 h of riding in only 1440 samples.
    const samples: DecouplingSample[] = []
    for (let second = 0; second < 120 * 60; second += 5) {
      samples.push({ offset_seconds: second, power: 160, heart_rate: 130 })
    }

    const outcome = computeDecoupling({ samples, ftp: FTP })

    if ('skip' in outcome) throw new Error(`expected a result, got ${outcome.skip}`)
    expect(outcome.result.analyzedSeconds).toBeGreaterThan(105 * 60)
    expect(outcome.result.verdict).toBe('solid')
    expect(outcome.result.first.hr).toBe(130)
  })

  it('stays quiet on a ride too short to judge the aerobic engine', () => {
    const outcome = computeDecoupling({
      samples: ride({ minutes: 45, power: () => 160, hr: () => 130 }),
      ftp: FTP,
    })

    expect(outcome).toEqual({ skip: 'too-short' })
  })

  it('stays quiet without power or without an FTP to judge intensity', () => {
    const noPower = computeDecoupling({
      samples: ride({ minutes: 120, power: () => null, hr: () => 130 }),
      ftp: FTP,
    })
    expect(noPower).toEqual({ skip: 'no-power' })

    const noFtp = computeDecoupling({
      samples: ride({ minutes: 120, power: () => 160, hr: () => 130 }),
      ftp: null,
    })
    expect(noFtp).toEqual({ skip: 'no-power' })
  })
})

describe('decouplingVerdict', () => {
  it('uses the 5% and 8% coaching cuts', () => {
    expect(decouplingVerdict(0)).toBe('solid')
    expect(decouplingVerdict(-3)).toBe('solid')
    expect(decouplingVerdict(5)).toBe('solid')
    expect(decouplingVerdict(5.1)).toBe('watch')
    expect(decouplingVerdict(8)).toBe('watch')
    expect(decouplingVerdict(8.1)).toBe('faded')
  })
})
