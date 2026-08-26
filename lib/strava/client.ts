import { serverEnv } from '@/lib/env'
import { stravaActivitySchema, stravaTokenSchema, type StravaActivity, type StravaToken } from './types'

import 'server-only'

const OAUTH_URL = 'https://www.strava.com/oauth/authorize'
const TOKEN_URL = 'https://www.strava.com/oauth/token'
const API_BASE = 'https://www.strava.com/api/v3'

export const STRAVA_SCOPES = 'read,activity:read_all,profile:read_all'

/** Cookie holding the OAuth `state` value between /connect and /callback. */
export const STRAVA_STATE_COOKIE = 'strava_oauth_state'

export class StravaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = 'StravaError'
  }
}

export function redirectUri(): string {
  return `${serverEnv().NEXT_PUBLIC_SITE_URL}/api/strava/callback`
}

export function authorizeUrl(state: string): string {
  const env = serverEnv()
  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPES,
    state,
  })
  return `${OAUTH_URL}?${params}`
}

async function postToken(body: Record<string, string>): Promise<StravaToken> {
  const env = serverEnv()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    // Never surface the raw body: it can echo back the client secret.
    throw new StravaError(
      `Strava token request failed (${response.status})`,
      response.status,
      response.status >= 500
    )
  }

  return stravaTokenSchema.parse(await response.json())
}

export function exchangeCodeForToken(code: string) {
  return postToken({ code, grant_type: 'authorization_code' })
}

export function refreshAccessToken(refreshToken: string) {
  return postToken({ refresh_token: refreshToken, grant_type: 'refresh_token' })
}

async function apiGet<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (response.status === 429) {
    throw new StravaError('Strava rate limit reached. Probá de nuevo en 15 minutos.', 429, true)
  }
  if (response.status === 401) {
    throw new StravaError('Strava rechazó el token. Reconectá tu cuenta.', 401, false)
  }
  if (!response.ok) {
    throw new StravaError(`Strava API error (${response.status})`, response.status, response.status >= 500)
  }

  return response.json() as Promise<T>
}

/** Athlete activity summaries, newest first. `after` is a Unix timestamp in seconds. */
export async function listActivities(
  accessToken: string,
  options: { after?: number; page?: number; perPage?: number } = {}
): Promise<StravaActivity[]> {
  const params: Record<string, string> = {
    page: String(options.page ?? 1),
    per_page: String(options.perPage ?? 50),
  }
  if (options.after) params.after = String(options.after)

  const raw = await apiGet<unknown[]>('/athlete/activities', accessToken, params)

  // Drop malformed entries rather than failing the whole sync.
  return raw.flatMap((item) => {
    const parsed = stravaActivitySchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export async function getActivity(accessToken: string, activityId: number): Promise<StravaActivity | null> {
  try {
    return stravaActivitySchema.parse(await apiGet(`/activities/${activityId}`, accessToken))
  } catch (error) {
    if (error instanceof StravaError && error.status === 404) return null
    throw error
  }
}

export type StravaStream = {
  time: number[]
  watts: (number | null)[]
  heartrate: (number | null)[]
  cadence: (number | null)[]
  velocity_smooth: (number | null)[]
  altitude: (number | null)[]
  temperature: (number | null)[]
  latlng: ([number, number] | null)[]
}

/** Download all available streams (second-by-second data) for an activity. */
export async function getAllStreams(
  accessToken: string,
  activityId: number
): Promise<StravaStream | null> {
  try {
    const streams = await apiGet<Record<string, { data?: unknown[] }>>(
      `/activities/${activityId}/streams`,
      accessToken,
      {
        keys: 'time,watts,heartrate,cadence,velocity_smooth,altitude,temperature,latlng',
        key_by_type: 'true',
        // Force max data density; Strava defaults to a reduced (~1000pt) resolution otherwise.
        resolution: 'high',
      }
    )

    // Must have time data to be valid
    const timeData = streams.time?.data
    if (!Array.isArray(timeData)) return null

    const extractStream = (name: string): (number | null)[] =>
      Array.isArray(streams[name]?.data)
        ? streams[name].data.map((v) => (typeof v === 'number' ? v : null))
        : timeData.map(() => null)

    const latlngData = Array.isArray(streams.latlng?.data)
      ? streams.latlng.data.map((v) =>
          Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number'
            ? ([v[0], v[1]] as [number, number])
            : null
        )
      : timeData.map(() => null)

    return {
      time: timeData.map((v) => (typeof v === 'number' ? v : 0)),
      watts: extractStream('watts'),
      heartrate: extractStream('heartrate'),
      cadence: extractStream('cadence'),
      velocity_smooth: extractStream('velocity_smooth'),
      altitude: extractStream('altitude'),
      temperature: extractStream('temperature'),
      latlng: latlngData,
    }
  } catch (error) {
    if (error instanceof StravaError && (error.status === 404 || error.status === 403)) return null
    throw error
  }
}

/** One watts value per recorded second, or null when the ride has no power data. */
export async function getWattsStream(
  accessToken: string,
  activityId: number
): Promise<Array<number | null> | null> {
  const streams = await getAllStreams(accessToken, activityId)
  return streams?.watts ?? null
}

export async function deauthorize(accessToken: string): Promise<void> {
  await fetch('https://www.strava.com/oauth/deauthorize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
}
