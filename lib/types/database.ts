/**
 * Hand-maintained mirror of `supabase/migrations`.
 * Regenerate once the Supabase CLI is linked:
 *   npx supabase gen types typescript --linked > lib/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type Sex = 'male' | 'female' | 'other'
export type Locale = 'es' | 'en'
export type ActivitySource = 'strava' | 'manual' | 'garmin'
export type BackfillStatus = 'idle' | 'running' | 'done' | 'error'
export type ConnectionStatus = 'connected' | 'expired' | 'revoked' | 'error'
export type SyncTrigger = 'manual' | 'webhook' | 'cron'
export type SyncStatus = 'success' | 'partial' | 'error'
export type WorkoutStatus = 'scheduled' | 'completed' | 'skipped' | 'moved'
export type PlanEmphasis = 'recovery' | 'maintenance' | 'build'
export type FtpSource = 'manual' | 'estimated'
export type StreamsStatus = 'ok' | 'no_power' | 'error'

/** Best mean-maximal watts, keyed by duration in seconds. */
export type PowerCurve = Record<string, number>

/** Activity row from database. */
export type ActivityRow = {
  id: string
  user_id: string
  source: ActivitySource
  external_id: string
  activity_type: string | null
  sport_type: string | null
  title: string | null
  description: string | null
  start_time: string
  timezone: string | null
  duration_seconds: number | null
  moving_seconds: number | null
  distance_meters: number | null
  elevation_gain_meters: number | null
  avg_power: number | null
  normalized_power: number | null
  max_power: number | null
  kilojoules: number | null
  has_power_meter: boolean
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_speed: number | null
  max_speed: number | null
  avg_temperature: number | null
  max_temperature: number | null
  training_effect_aerobic: number | null
  training_effect_anaerobic: number | null
  avg_respiration_rate: number | null
  calories: number | null
  sweat_loss_ml: number | null
  garmin_training_load: number | null
  training_load: number | null
  intensity_factor: number | null
  perceived_exertion: number | null
  is_trainer: boolean
  raw_data_reference: string | null
  power_curve: PowerCurve | null
  streams_fetched_at: string | null
  streams_status: StreamsStatus | null
  created_at: string
  updated_at: string
}

type UserRow = {
  id: string
  email: string | null
  name: string | null
  age: number | null
  sex: Sex | null
  weight_kg: number | null
  height_cm: number | null
  experience_level: ExperienceLevel | null
  cycling_goals: string[]
  timezone: string
  locale: Locale
  telegram_chat_id: number | null
  telegram_link_code: string | null
  created_at: string
  updated_at: string
}

type AthleteMetricsRow = {
  user_id: string
  ftp: number | null
  max_hr: number | null
  resting_hr: number | null
  vo2max: number | null
  ftp_source: FtpSource
  ftp_updated_at: string | null
  created_at: string
  updated_at: string
}

type AvailabilityRow = {
  id: string
  user_id: string
  day_of_week: number
  bike_minutes: number
  strength_minutes: number
  created_at: string
  updated_at: string
}

type StravaConnectionRow = {
  user_id: string
  athlete_id: number | null
  access_token_encrypted: string
  refresh_token_encrypted: string
  expires_at: string
  scopes: string | null
  connection_status: ConnectionStatus
  last_sync_at: string | null
  last_sync_error: string | null
  connected_at: string
  updated_at: string
}

// ActivityRow is exported above

type TrainingLoadRow = {
  id: string
  user_id: string
  date: string
  daily_load: number
  acute_load: number | null
  chronic_load: number | null
  form: number | null
  ramp_rate: number | null
  created_at: string
  updated_at: string
}

type WorkoutRow = {
  id: string
  user_id: string
  scheduled_date: string
  workout_type: string | null
  title: string | null
  description: string | null
  duration_minutes: number | null
  target_zone: string | null
  target_power: number | null
  target_hr: number | null
  target_cadence: number | null
  purpose: string | null
  rationale: string | null
  status: WorkoutStatus
  completed_activity_id: string | null
  created_at: string
  updated_at: string
}

type CoachMessageRow = {
  id: string
  user_id: string
  direction: 'inbound' | 'outbound'
  channel: 'web' | 'telegram'
  message: string
  intent: string | null
  metadata: Json
  created_at: string
}

type SyncLogRow = {
  id: string
  user_id: string
  source: string
  trigger: SyncTrigger
  status: SyncStatus
  activities_synced: number
  error_message: string | null
  started_at: string
  finished_at: string | null
}

type PlanWeekRow = {
  id: string
  user_id: string
  start_date: string
  end_date: string
  emphasis: PlanEmphasis
  block_position: number
  target_load: number
  planned_load: number
  rationale: string | null
  created_at: string
}

type SleepRow = {
  id: string
  user_id: string
  date: string
  source: string
  duration_minutes: number | null
  sleep_score: number | null
  deep_sleep_minutes: number | null
  rem_sleep_minutes: number | null
  awake_minutes: number | null
  created_at: string
}

type RecoveryMetricsRow = {
  id: string
  user_id: string
  date: string
  source: string
  resting_hr: number | null
  hrv: number | null
  stress: number | null
  soreness: number | null
  motivation: number | null
  recovery_status: string | null
  body_battery_high: number | null
  body_battery_low: number | null
  spo2_avg: number | null
  vo2max_cycling: number | null
  created_at: string
}

type GarminConnectionRow = {
  user_id: string
  garmin_email: string
  tokens_encrypted: string
  last_sync_at: string | null
  last_sync_error: string | null
  sync_enabled: boolean
  backfill_status: BackfillStatus
  backfill_cursor: number
  backfill_processed: number
  backfill_error: string | null
  backfill_started_at: string | null
  backfill_finished_at: string | null
  created_at: string
  updated_at: string
}

/** Insert type: generated columns and defaulted columns become optional. */
type Insert<T, Required extends keyof T> = Pick<T, Required> & Partial<Omit<T, Required>>

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow
        Insert: Insert<UserRow, 'id'>
        Update: Partial<UserRow>
        Relationships: []
      }
      athlete_metrics: {
        Row: AthleteMetricsRow
        Insert: Insert<AthleteMetricsRow, 'user_id'>
        Update: Partial<AthleteMetricsRow>
        Relationships: []
      }
      availability: {
        Row: AvailabilityRow
        Insert: Insert<AvailabilityRow, 'user_id' | 'day_of_week'>
        Update: Partial<AvailabilityRow>
        Relationships: []
      }
      strava_connections: {
        Row: StravaConnectionRow
        Insert: Insert<
          StravaConnectionRow,
          'user_id' | 'access_token_encrypted' | 'refresh_token_encrypted' | 'expires_at'
        >
        Update: Partial<StravaConnectionRow>
        Relationships: []
      }
      activities: {
        Row: ActivityRow
        Insert: Insert<ActivityRow, 'user_id' | 'source' | 'external_id' | 'start_time'>
        Update: Partial<ActivityRow>
        Relationships: []
      }
      training_load: {
        Row: TrainingLoadRow
        Insert: Insert<TrainingLoadRow, 'user_id' | 'date'>
        Update: Partial<TrainingLoadRow>
        Relationships: []
      }
      workouts: {
        Row: WorkoutRow
        Insert: Insert<WorkoutRow, 'user_id' | 'scheduled_date'>
        Update: Partial<WorkoutRow>
        Relationships: []
      }
      coach_messages: {
        Row: CoachMessageRow
        Insert: Insert<CoachMessageRow, 'user_id' | 'direction' | 'message'>
        Update: Partial<CoachMessageRow>
        Relationships: []
      }
      sync_logs: {
        Row: SyncLogRow
        Insert: Insert<SyncLogRow, 'user_id' | 'source' | 'trigger' | 'status'>
        Update: Partial<SyncLogRow>
        Relationships: []
      }
      plan_weeks: {
        Row: PlanWeekRow
        Insert: Insert<PlanWeekRow, 'user_id' | 'start_date' | 'end_date' | 'emphasis'>
        Update: Partial<PlanWeekRow>
        Relationships: []
      }
      sleep: {
        Row: SleepRow
        Insert: Insert<SleepRow, 'user_id' | 'date'>
        Update: Partial<SleepRow>
        Relationships: []
      }
      recovery_metrics: {
        Row: RecoveryMetricsRow
        Insert: Insert<RecoveryMetricsRow, 'user_id' | 'date'>
        Update: Partial<RecoveryMetricsRow>
        Relationships: []
      }
      garmin_connections: {
        Row: GarminConnectionRow
        Insert: Insert<GarminConnectionRow, 'user_id' | 'garmin_email' | 'tokens_encrypted'>
        Update: Partial<GarminConnectionRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
