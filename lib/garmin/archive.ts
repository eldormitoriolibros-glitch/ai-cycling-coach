import 'server-only'

export type ExtractedFit = { name: string; data: Buffer }

export type ExtractReport = {
  fits: ExtractedFit[]
  /** Entry names seen inside archives that were not FIT payloads. */
  skipped: string[]
  /** Human-readable reasons extraction failed, for diagnostics. */
  errors: string[]
  /** What the top-level upload looked like by magic bytes. */
  topLevelKind: 'zip' | 'gzip' | 'fit' | 'text' | 'unknown'
}

const MAX_DEPTH = 4

function isGzip(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b
}

function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
}

/** FIT files carry the ASCII marker ".FIT" at byte offset 8 of the header. */
function isFit(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString('ascii', 8, 12) === '.FIT'
}

function looksLikeText(buf: Buffer): boolean {
  const len = Math.min(512, buf.length)
  for (let i = 0; i < len; i++) {
    const byte = buf[i]
    if (byte === 0 || byte < 9) return false
  }
  return true
}

function classify(buf: Buffer): ExtractReport['topLevelKind'] {
  if (isZip(buf)) return 'zip'
  if (isGzip(buf)) return 'gzip'
  if (isFit(buf)) return 'fit'
  if (looksLikeText(buf)) return 'text'
  return 'unknown'
}

async function walk(
  buf: Buffer,
  name: string,
  depth: number,
  report: ExtractReport
): Promise<void> {
  if (depth > MAX_DEPTH) {
    report.errors.push(`${name}: anidamiento demasiado profundo`)
    return
  }

  const { unzipSync, gunzipSync } = await import('fflate')

  if (isGzip(buf)) {
    try {
      const inflated = Buffer.from(gunzipSync(new Uint8Array(buf)))
      await walk(inflated, name.replace(/\.gz$/i, ''), depth + 1, report)
    } catch (err) {
      report.errors.push(`${name}: no se pudo descomprimir gzip (${errMsg(err)})`)
    }
    return
  }

  if (isZip(buf)) {
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(new Uint8Array(buf))
    } catch (err) {
      report.errors.push(`${name}: no se pudo abrir el zip (${errMsg(err)})`)
      return
    }

    const names = Object.keys(entries)
    if (names.length === 0) report.errors.push(`${name}: zip vacío`)

    for (const entryName of names) {
      const data = entries[entryName]
      if (data.length === 0) continue
      if (entryName.endsWith('/')) continue
      await walk(Buffer.from(data), entryName, depth + 1, report)
    }
    return
  }

  if (isFit(buf)) {
    report.fits.push({ name, data: buf })
    return
  }

  report.skipped.push(name)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Collects every FIT payload inside a user upload. Handles bare .fit, gzipped
 * .fit.gz, and zips — including the nested zips Garmin's bulk "Export Your Data"
 * archive produces. Reports what it skipped and why so failures are debuggable
 * instead of silently yielding zero results.
 */
export async function extractFitReport(buf: Buffer, name: string): Promise<ExtractReport> {
  const report: ExtractReport = {
    fits: [],
    skipped: [],
    errors: [],
    topLevelKind: classify(buf),
  }
  await walk(buf, name, 0, report)
  return report
}

export async function extractFitBuffers(buf: Buffer, name: string): Promise<ExtractedFit[]> {
  return (await extractFitReport(buf, name)).fits
}
