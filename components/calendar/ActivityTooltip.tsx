'use client'

import type { CalendarActivity } from '@/lib/calendar/types'
import { formatCalendarDistance, formatCalendarDuration } from '@/lib/calendar/format'

export function ActivityTooltip({
  activity,
  position,
}: {
  activity: CalendarActivity
  position: { x: number; y: number }
}) {
  return (
    <div
      className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-surface p-3 text-sm pointer-events-none max-w-[250px]"
      style={{ top: position.y - 120, left: position.x - 100 }}
    >
      <p className="text-[10px] text-muted">
        {new Date(activity.start_time).toLocaleString('es-AR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
      <p className="font-semibold text-foreground mt-0.5">{activity.title ?? 'Sin título'}</p>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted">
        <span>Distancia</span>
        <span className="font-medium text-foreground">{formatCalendarDistance(activity.distance_meters)}</span>
        {activity.moving_seconds ? (
          <>
            <span>Tiempo</span>
            <span className="font-medium text-foreground">{formatCalendarDuration(activity.moving_seconds)}</span>
          </>
        ) : null}
        {activity.avg_hr ? (
          <>
            <span>Pulso medio</span>
            <span className="font-medium text-foreground">{activity.avg_hr} ppm</span>
          </>
        ) : null}
        {activity.avg_power ? (
          <>
            <span>Potencia</span>
            <span className="font-medium text-foreground">{Math.round(activity.avg_power)} W</span>
          </>
        ) : null}
        {activity.training_load ? (
          <>
            <span>Carga</span>
            <span className="font-medium text-foreground">{Math.round(activity.training_load)}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}
