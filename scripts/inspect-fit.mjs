import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import FitParser from 'fit-file-parser'

const path = process.argv[2]
if (!path) {
  console.error('usage: node scripts/inspect-fit.mjs <file.zip|file.fit>')
  process.exit(1)
}

const raw = readFileSync(path)

function collectFits(buf, name, depth = 0, out = []) {
  if (depth > 4) return out
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
  const isFit = buf.length > 12 && buf.toString('ascii', 8, 12) === '.FIT'
  if (isZip) {
    const entries = unzipSync(new Uint8Array(buf))
    for (const [n, d] of Object.entries(entries)) {
      if (d.length) collectFits(Buffer.from(d), n, depth + 1, out)
    }
  } else if (isFit) {
    out.push({ name, data: buf })
  }
  return out
}

const fits = collectFits(raw, path)
console.log(`FIT payloads found: ${fits.length}`)

for (const { name, data } of fits) {
  const parser = new FitParser({ mode: 'list', speedUnit: 'm/s', lengthUnit: 'm', elapsedRecordField: true })
  const input = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const parsed = await parser.parseAsync(input)

  const sessions = parsed.sessions ?? []
  const records = parsed.records ?? []
  console.log(`\n=== ${name} ===`)
  console.log('top-level keys:', Object.keys(parsed).filter((k) => {
    const v = parsed[k]
    return Array.isArray(v) ? v.length > 0 : v != null
  }).join(', '))
  console.log('sessions:', sessions.length, '| records:', records.length, '| laps:', (parsed.laps ?? []).length)

  sessions.forEach((s, i) => {
    console.log(`-- session ${i}`)
    console.log('   start_time:', s.start_time)
    console.log('   total_elapsed_time:', s.total_elapsed_time)
    console.log('   total_distance:', s.total_distance)
    console.log('   sport:', s.sport)
    console.log('   avg_heart_rate:', s.avg_heart_rate)
    console.log('   avg_temperature:', s.avg_temperature)
    console.log('   avg_respiration_rate:', s.avg_respiration_rate)
    console.log('   total_training_effect:', s.total_training_effect)
  })

  const nn = (k) => records.filter((r) => r[k] != null).length
  console.log('records with heart_rate:', nn('heart_rate'))
  console.log('records with temperature:', nn('temperature'))
  console.log('records with respiration_rate:', nn('respiration_rate'))
  console.log('records with enhanced_respiration_rate:', nn('enhanced_respiration_rate'))
  console.log('records with power:', nn('power'))
  console.log('records with cadence:', nn('cadence'))
  if (records.length) {
    console.log('first record keys:', Object.keys(records[0]).join(', '))
    console.log('first record ts:', records[0].timestamp, '| last record ts:', records[records.length - 1].timestamp)
  }
}
