import { z } from 'zod'

/**
 * Server-only environment. Importing this from a client component will throw at
 * build time because the secrets are absent from the browser bundle.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().transform((v) => v.replace(/\/$/, '')),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be a base64-encoded 32-byte key'),
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
})

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | null = null

export function serverEnv(): ServerEnv {
  if (cached) return cached

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid or missing environment variables:\n${missing}\n\nSee .env.example.`)
  }

  cached = parsed.data
  return cached
}

/**
 * Optional integrations. The app runs without them; each feature checks its own
 * config and degrades instead of crashing at boot.
 */
const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.0-flash'),
})

const telegramSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
})

const cronSchema = z.object({
  CRON_SECRET: z.string().min(16),
})

export function geminiEnv() {
  const parsed = geminiSchema.safeParse(process.env)
  return parsed.success ? parsed.data : null
}

export function telegramEnv() {
  const parsed = telegramSchema.safeParse(process.env)
  return parsed.success ? parsed.data : null
}

export function cronEnv() {
  const parsed = cronSchema.safeParse(process.env)
  return parsed.success ? parsed.data : null
}

/** Safe on both server and client — these two are inlined by Next at build time. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
}
