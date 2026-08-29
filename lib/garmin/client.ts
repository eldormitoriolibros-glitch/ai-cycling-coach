import { GarminConnect } from 'garmin-connect'
import type GarminConnectType from 'garmin-connect/dist/garmin/GarminConnect'
import { encrypt, decrypt } from '@/lib/crypto'
import { createAdminClient } from '@/lib/supabase/admin'

import 'server-only'

type GCInstance = InstanceType<typeof GarminConnect>

export type GarminAuthResult =
  | { ok: true; email: string; tokensEncrypted: string }
  | { ok: false; needsMfa: boolean; error?: string }

/**
 * Authenticate with Garmin using email + password. The password is used once
 * to obtain OAuth tokens and is never stored.
 */
export async function loginWithCredentials(
  email: string,
  password: string
): Promise<GarminAuthResult> {
  try {
    const client = new GarminConnect({ username: email, password })
    await client.login()
    const tokens = client.exportToken()
    const tokensEncrypted = encrypt(JSON.stringify(tokens))
    return { ok: true, email, tokensEncrypted }
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (msg.includes('MFA') || msg.includes('mfa') || msg.includes('two-factor')) {
      return { ok: false, needsMfa: true }
    }
    return { ok: false, needsMfa: false, error: msg }
  }
}

/**
 * Create a Garmin client from encrypted stored tokens.
 * The library insists on credentials in the constructor even when loading
 * tokens; username is informational, password is unused after loadToken.
 */
export function clientFromTokens(
  tokensEncrypted: string,
  email = 'token-session'
): {
  client: GCInstance
  getUpdatedTokens: () => string
} {
  const tokens = JSON.parse(decrypt(tokensEncrypted))
  const client = new GarminConnect({ username: email, password: 'token' })
  client.loadToken(tokens.oauth1, tokens.oauth2)
  return {
    client,
    getUpdatedTokens: () => encrypt(JSON.stringify(client.exportToken())),
  }
}

/** Load Garmin client for a user, or null if not connected. */
export async function getGarminClient(userId: string): Promise<{
  client: GCInstance
  saveTokens: () => Promise<void>
} | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('garmin_connections')
    .select('tokens_encrypted, garmin_email')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data?.tokens_encrypted) return null

  const { client, getUpdatedTokens } = clientFromTokens(
    data.tokens_encrypted,
    data.garmin_email || 'token-session'
  )
  return {
    client,
    saveTokens: async () => {
      await supabase
        .from('garmin_connections')
        .update({ tokens_encrypted: getUpdatedTokens(), updated_at: new Date().toISOString() } as any)
        .eq('user_id', userId)
    },
  }
}
