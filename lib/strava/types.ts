import { z } from 'zod'

/**
 * Only the fields we persist are validated; Strava sends many more.
 * `.passthrough()` keeps the payload usable if Strava adds fields.
 */
export const stravaTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  scope: z.string().optional(),
  athlete: z.object({ id: z.number() }).optional(),
})

export type StravaToken = z.infer<typeof stravaTokenSchema>

export const stravaActivitySchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  type: z.string().nullish(),
  sport_type: z.string().nullish(),
  start_date: z.string(),
  timezone: z.string().nullish(),
  elapsed_time: z.number().nullish(),
  moving_time: z.number().nullish(),
  distance: z.number().nullish(),
  total_elevation_gain: z.number().nullish(),
  average_watts: z.number().nullish(),
  weighted_average_watts: z.number().nullish(),
  max_watts: z.number().nullish(),
  kilojoules: z.number().nullish(),
  device_watts: z.boolean().nullish(),
  average_heartrate: z.number().nullish(),
  max_heartrate: z.number().nullish(),
  average_cadence: z.number().nullish(),
  average_speed: z.number().nullish(),
  max_speed: z.number().nullish(),
  trainer: z.boolean().nullish(),
})

export type StravaActivity = z.infer<typeof stravaActivitySchema>

export const stravaWebhookEventSchema = z.object({
  object_type: z.enum(['activity', 'athlete']),
  object_id: z.number(),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.number(),
  subscription_id: z.number().optional(),
  event_time: z.number().optional(),
  updates: z.record(z.string()).optional(),
})

export type StravaWebhookEvent = z.infer<typeof stravaWebhookEventSchema>

/** Strava sport types we treat as cycling. */
export const CYCLING_SPORT_TYPES = new Set([
  'Ride',
  'MountainBikeRide',
  'GravelRide',
  'VirtualRide',
  'EBikeRide',
  'EMountainBikeRide',
  'Velomobile',
  'Handcycle',
])
