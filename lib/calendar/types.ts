export type CalendarActivity = {
  id: string
  title: string | null
  start_time: string
  distance_meters: number | null
  moving_seconds: number | null
  duration_seconds: number | null
  avg_hr: number | null
  avg_power: number | null
  training_load: number | null
  sport_type: string | null
  activity_type: string | null
}

export type WeekData = {
  startDate: Date
  endDate: Date
  label: string
  totalDistance: number
  totalSeconds: number
  activities: Map<number, CalendarActivity[]>
}

export type CalendarViewMode = 'month' | '6months' | 'year'
