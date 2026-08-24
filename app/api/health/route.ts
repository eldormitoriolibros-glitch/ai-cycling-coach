import { NextResponse } from 'next/server'
import { cronEnv, geminiEnv, serverEnvIssues, telegramEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Deployment readiness check. Reports which environment variables are missing or
 * malformed by name and reason only — never values — so a broken deploy can be
 * diagnosed without dashboard access.
 */
export async function GET() {
  const issues = serverEnvIssues()

  return NextResponse.json(
    {
      ok: issues.length === 0,
      required: issues.length === 0 ? 'ok' : issues,
      optional: {
        gemini: geminiEnv() !== null,
        telegram: telegramEnv() !== null,
        cron: cronEnv() !== null,
      },
    },
    { status: issues.length === 0 ? 200 : 503 }
  )
}
