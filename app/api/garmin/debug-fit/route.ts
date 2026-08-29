import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import FitParser from 'fit-file-parser'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const parser = new FitParser({ mode: 'list', speedUnit: 'm/s', lengthUnit: 'm', elapsedRecordField: true })
  const input = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const data = await parser.parseAsync(input as ArrayBuffer) as any

  const sessions = Array.isArray(data?.sessions) ? data.sessions : []

  // Return all session keys and their values (for debugging field names)
  const sessionFields = sessions.map((s: any, i: number) => ({
    index: i,
    allKeys: Object.keys(s).sort(),
    temperatureFields: Object.entries(s).filter(([k]) => k.toLowerCase().includes('temp')),
    trainingEffectFields: Object.entries(s).filter(([k]) => k.toLowerCase().includes('training') || k.toLowerCase().includes('effect')),
    respirationFields: Object.entries(s).filter(([k]) => k.toLowerCase().includes('resp')),
    calorieFields: Object.entries(s).filter(([k]) => k.toLowerCase().includes('calor')),
    powerFields: Object.entries(s).filter(([k]) => k.toLowerCase().includes('power')),
  }))

  return NextResponse.json({ sessionCount: sessions.length, sessions: sessionFields })
}
