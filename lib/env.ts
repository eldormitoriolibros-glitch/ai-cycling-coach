import { z } from 'zod'

/**
 * Server-only environment. Importing this from a client component will throw at
 * build time because the secrets are absent from the browser bundle.
 */
const serverSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1)
      .refine(
        (v) => !v.startsWith('sb_publishable_'),
        'looks like a publishable key; this must be the secret key (sb_secret_...) or the legacy service_role JWT'
      ),
    NEXT_PUBLIC_SITE_URL: z.string().url().transform((v) => v.replace(/\/$/, '')),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be a base64-encoded 32-byte key'),
    STRAVA_CLIENT_ID: z.string().min(1),
    STRAVA_CLIENT_SECRET: z.string().min(1),
    STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    if (env.SUPABASE_SERVICE_ROLE_KEY === env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message: 'is identical to the anon key; server-side writes would be blocked by RLS',
      })
    }
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

/** Variable names and reasons, never values — safe to expose from a health check. */
export function serverEnvIssues(): string[] {
  const parsed = serverSchema.safeParse(process.env)
  if (parsed.success) return []
  return parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
}

/**
 * Optional integrations. The app runs without them; each feature checks its own
 * config and degrades instead of crashing at boot.
 */
const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
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
