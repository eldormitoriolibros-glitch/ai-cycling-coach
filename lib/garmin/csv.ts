/**
 * Parser for the Garmin Connect activity CSV export.
 *
 * Pure functions, no I/O. Headers are matched in Spanish and English because
 * Garmin localises the export to the account language.
 */

export type GarminRow = {
  startLocal: string
  activityType: string | null
  title: string | null
  distanceMeters: number | null
  movingSeconds: number | null
  elapsedSeconds: number | null
  elevationGain: number | null
  avgSpeed: number | null
  maxSpeed: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  calories: number | null
}

const HEADERS = {
  date: ['fecha', 'date'],
  type: ['tipo de actividad', 'activity type'],
  title: ['título', 'titulo', 'title'],
  distance: ['distancia', 'distance'],
  moving: ['tiempo en movimiento', 'moving time'],
  elapsed: ['tiempo transcurrido', 'elapsed time'],
  timer: ['tiempo', 'time'],
  elevation: ['ascenso total', 'total ascent', 'elev gain'],
  avgSpeed: ['velocidad media', 'avg speed', 'average speed'],
  maxSpeed: ['velocidad máxima', 'velocidad maxima', 'max speed'],
  avgHr: ['frecuencia cardiaca media', 'frecuencia cardíaca media', 'avg hr', 'average heart rate'],
  maxHr: ['fc máxima', 'fc maxima', 'max hr', 'max heart rate'],
  avgCadence: ['cadencia media de pedaleo', 'avg bike cadence', 'average cadence'],
  maxCadence: ['cadencia de pedaleo máxima', 'max bike cadence', 'max cadence'],
  calories: ['calorías', 'calorias', 'calories'],
} as const

/** RFC4180-ish: handles quoted fields and doubled quotes inside them. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  // Strip BOM; Garmin writes UTF-8 with one.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Garmin writes thousands separators inside quotes: "2,131". */
function toNumber(value: string | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(/[",\s]/g, '').replace(/^'/, '')
  if (!cleaned || cleaned === '--') return null
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** `HH:MM:SS`, `MM:SS` or `HH:MM:SS.s` to seconds. */
function toSeconds(value: string | undefined): number | null {
  if (!value) return null
  const parts = value.trim().split(':')
  if (parts.length < 2) return null

  const nums = parts.map((p) => Number.parseFloat(p))
  if (nums.some((n) => !Number.isFinite(n))) return null

  const seconds =
    nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1]

  return Math.round(seconds)
}

function columnIndex(header: string[], aliases: readonly string[]): number {
  return header.findIndex((h) => aliases.includes(h.trim().toLowerCase()))
}

export function parseGarminCsv(text: string): GarminRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const header = rows[0]
  const idx = {
    date: columnIndex(header, HEADERS.date),
    type: columnIndex(header, HEADERS.type),
    title: columnIndex(header, HEADERS.title),
    distance: columnIndex(header, HEADERS.distance),
    moving: columnIndex(header, HEADERS.moving),
    elapsed: columnIndex(header, HEADERS.elapsed),
    timer: columnIndex(header, HEADERS.timer),
    elevation: columnIndex(header, HEADERS.elevation),
    avgSpeed: columnIndex(header, HEADERS.avgSpeed),
    maxSpeed: columnIndex(header, HEADERS.maxSpeed),
    avgHr: columnIndex(header, HEADERS.avgHr),
    maxHr: columnIndex(header, HEADERS.maxHr),
    avgCadence: columnIndex(header, HEADERS.avgCadence),
    maxCadence: columnIndex(header, HEADERS.maxCadence),
    calories: columnIndex(header, HEADERS.calories),
  }

  if (idx.date === -1) return []

  const at = (row: string[], i: number) => (i === -1 ? undefined : row[i])

  return rows.slice(1).flatMap((row) => {
    const startLocal = at(row, idx.date)?.trim()
    if (!startLocal) return []

    const distanceValue = toNumber(at(row, idx.distance))

    return [
      {
        startLocal,
        activityType: at(row, idx.type)?.trim() ?? null,
        title: at(row, idx.title)?.trim() || null,
        // Unit is decided by the caller: Garmin exports km or miles by account setting.
        distanceMeters: distanceValue,
        movingSeconds: toSeconds(at(row, idx.moving)) ?? toSeconds(at(row, idx.timer)),
        elapsedSeconds: toSeconds(at(row, idx.elapsed)),
        elevationGain: toNumber(at(row, idx.elevation)),
        avgSpeed: toNumber(at(row, idx.avgSpeed)),
        maxSpeed: toNumber(at(row, idx.maxSpeed)),
        avgHr: toNumber(at(row, idx.avgHr)),
        maxHr: toNumber(at(row, idx.maxHr)),
        avgCadence: toNumber(at(row, idx.avgCadence)),
        maxCadence: toNumber(at(row, idx.maxCadence)),
        calories: toNumber(at(row, idx.calories)),
      },
    ]
  })
}
