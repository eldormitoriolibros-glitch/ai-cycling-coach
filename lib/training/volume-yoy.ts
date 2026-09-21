/**
 * Hours this year against the same months last year. Volume, not load:
 * a Z2 century and a VO2 session both count the time you were moving.
 *
 * Pure functions only.
 */

export type VolumeRide = {
  date: string
  seconds: number
}

export type VolumeMonth = {
  month: number
  label: string
  thisYearHours: number
  lastYearHours: number
}

export type YearVolume = {
  year: number
  months: VolumeMonth[]
  thisYearHours: number
  lastYearHours: number
  /** Through the last month that has this-year data. */
  lastYearToDateHours: number
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function rollupYearVolume(input: {
  rides: VolumeRide[]
  year: number
}): YearVolume {
  const thisHours = new Array(12).fill(0)
  const lastHours = new Array(12).fill(0)

  for (const ride of input.rides) {
    const year = Number(ride.date.slice(0, 4))
    const month = Number(ride.date.slice(5, 7)) - 1
    if (month < 0 || month > 11) continue
    const hours = Math.max(0, ride.seconds) / 3600
    if (year === input.year) thisHours[month] += hours
    else if (year === input.year - 1) lastHours[month] += hours
  }

  const lastWithData = thisHours.reduce((last, hours, i) => (hours > 0 ? i : last), -1)
  const through = lastWithData >= 0 ? lastWithData : new Date().getMonth()

  const months: VolumeMonth[] = MONTHS.map((label, i) => ({
    month: i + 1,
    label,
    thisYearHours: roundHours(thisHours[i]),
    lastYearHours: roundHours(lastHours[i]),
  }))

  return {
    year: input.year,
    months,
    thisYearHours: roundHours(thisHours.reduce((a, b) => a + b, 0)),
    lastYearHours: roundHours(lastHours.reduce((a, b) => a + b, 0)),
    lastYearToDateHours: roundHours(lastHours.slice(0, through + 1).reduce((a, b) => a + b, 0)),
  }
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10
}
