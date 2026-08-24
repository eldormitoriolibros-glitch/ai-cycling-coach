import { decrypt, encrypt } from '@/lib/crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAccessToken } from './client'
import type { StravaToken } from './types'

import 'server-only'

/** Refresh this many seconds before actual expiry. */
const REFRESH_MARGIN_SECONDS = 300

export class StravaNotConnectedError extends Error {
  constructor() {
    super('Strava no está conectado.')
    this.name = 'StravaNotConnectedError'
  }
}

export async function saveConnection(userId: string, token: StravaToken) {
  const supabase = createAdminClient()

  const { error } = await supabase.from('strava_connections').upsert(
    {
      user_id: userId,
      athlete_id: token.athlete?.id ?? null,
      access_token_encrypted: encrypt(token.access_token),
      refresh_token_encrypted: encrypt(token.refresh_token),
      expires_at: new Date(token.expires_at * 1000).toISOString(),
      scopes: token.scope ?? null,
      connection_status: 'connected',
      last_sync_error: null,
    },
    { onConflict: 'user_id' }
  )

  if (error) throw new Error(`No se pudo guardar la conexión de Strava: ${error.message}`)
}

/**
 * Returns a usable access token, refreshing and re-persisting it when needed.
 * Throws StravaNotConnectedError when the user has no connection.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data: connection, error } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!connection) throw new StravaNotConnectedError()

  const expiresAt = new Date(connection.expires_at).getTime()
  const stillValid = expiresAt - REFRESH_MARGIN_SECONDS * 1000 > Date.now()

  if (stillValid) return decrypt(connection.access_token_encrypted)

  try {
    const refreshed = await refreshAccessToken(decrypt(connection.refresh_token_encrypted))
    await saveConnection(userId, refreshed)
    return refreshed.access_token
  } catch (err) {
    await supabase
      .from('strava_connections')
      .update({
        connection_status: 'expired',
        last_sync_error: err instanceof Error ? err.message : 'Refresh failed',
      })
      .eq('user_id', userId)
    throw err
  }
}

export async function findUserByAthleteId(athleteId: number): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('strava_connections')
    .select('user_id')
    .eq('athlete_id', athleteId)
    .maybeSingle()

  return data?.user_id ?? null
}
