import { describe, expect, it } from 'vitest'
import { estimateTrainingLoad } from '@/lib/training/load'
import { hasDeviceRecovery, computeReadiness } from '@/lib/training/readiness'

describe('estimateTrainingLoad', () => {
  it('prefers power when FTP is set', () => {
    const result = estimateTrainingLoad({
      durationSeconds: 3600,
      normalizedPower: 200,
      averagePower: 190,
      averageHr: 150,
      ftp: 250,
      maxHr: 190,
      restingHr: 55,
    })
    expect(result.intensityFactor).toBe(0.8)
    expect(result.trainingLoad).toBe(64)
  })

  it('uses heart rate when there is no power, even without a typed max HR', () => {
    const withMax = estimateTrainingLoad({
      durationSeconds: 3600,
      normalizedPower: null,
      averagePower: null,
      averageHr: 145,
      ftp: null,
      maxHr: 190,
      restingHr: 60,
    })
    const withoutMax = estimateTrainingLoad({
      durationSeconds: 3600,
      normalizedPower: null,
      averagePower: null,
      averageHr: 145,
      ftp: null,
      maxHr: null,
      restingHr: 60,
    })
    expect(withMax.trainingLoad).not.toBeNull()
    expect(withoutMax.trainingLoad).toBe(withMax.trainingLoad)
  })

  it('estimates endurance load from duration when sensors are missing', () => {
    const result = estimateTrainingLoad({
      durationSeconds: 90 * 60,
      normalizedPower: null,
      averagePower: null,
      averageHr: null,
      ftp: null,
      maxHr: null,
      restingHr: null,
    })
    expect(result.intensityFactor).toBe(0.65)
    expect(result.trainingLoad).toBe(63.4)
  })

  it('skips crumbs that are too short to count as a ride', () => {
    const result = estimateTrainingLoad({
      durationSeconds: 3 * 60,
      normalizedPower: null,
      averagePower: null,
      averageHr: null,
      ftp: null,
      maxHr: null,
      restingHr: null,
    })
    expect(result.trainingLoad).toBeNull()
  })
})

describe('hasDeviceRecovery', () => {
  it('is false when readiness is only form or empty', () => {
    const empty = computeReadiness({
      form: null,
      restingHr: null,
      baselineRestingHr: null,
      hrv: null,
      baselineHrv: null,
      sleepHours: null,
      sleepScore: null,
      soreness: null,
      motivation: null,
      bodyBattery: null,
      stressAvg: null,
      spo2: null,
    })
    const carga = computeReadiness({
      form: -8,
      restingHr: null,
      baselineRestingHr: null,
      hrv: null,
      baselineHrv: null,
      sleepHours: null,
      sleepScore: null,
      soreness: null,
      motivation: null,
      bodyBattery: null,
      stressAvg: null,
      spo2: null,
    })
    expect(hasDeviceRecovery(empty)).toBe(false)
    expect(hasDeviceRecovery(carga)).toBe(false)
  })

  it('is true when a watch sent a recovery signal', () => {
    const r = computeReadiness({
      form: 5,
      restingHr: null,
      baselineRestingHr: null,
      hrv: null,
      baselineHrv: null,
      sleepHours: 7.5,
      sleepScore: 80,
      soreness: null,
      motivation: null,
      bodyBattery: null,
      stressAvg: null,
      spo2: null,
    })
    expect(hasDeviceRecovery(r)).toBe(true)
  })
})
