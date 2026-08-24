import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/types/database'

/**
 * Request-scoped client for Server Components, Route Handlers and Server Actions.
 * Writing cookies throws inside a Server Component; the middleware refreshes the
 * session there, so that failure is safe to swallow.
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Component render pass — middleware already refreshed the session.
        }
      },
    },
  })
}
