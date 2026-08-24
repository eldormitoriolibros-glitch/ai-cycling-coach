import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'
import type { Database } from '@/lib/types/database'

import 'server-only'

/**
 * Service-role client. Bypasses RLS entirely — only for trusted server paths
 * that have no user session (Strava/Telegram webhooks, cron jobs) or that must
 * write columns the browser is not allowed to touch (encrypted OAuth tokens).
 * Always scope queries by `user_id` yourself here; RLS will not do it for you.
 */
export function createAdminClient() {
  const env = serverEnv()

  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
