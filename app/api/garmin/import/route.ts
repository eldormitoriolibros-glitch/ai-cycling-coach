import { NextResponse } from 'next/server'
import { importGarminCsv } from '@/lib/garmin/import'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const entry = form.get('file')
    if (entry instanceof File) file = entry
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo.' }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'Falta el archivo CSV.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo es demasiado grande (máx. 5 MB).' }, { status: 413 })
  }

  try {
    const result = await importGarminCsv(user.id, await file.text())

    if (result.parsed === 0) {
      return NextResponse.json(
        { error: 'No se reconoció el formato. Usá el CSV de la lista de actividades de Garmin Connect.' },
        { status: 422 }
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo importar el archivo.' },
      { status: 500 }
    )
  }
}
