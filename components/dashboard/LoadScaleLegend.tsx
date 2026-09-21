import { LOAD_LEVEL_OPACITY, loadFill } from '@/lib/training/load-scale'
import { cn } from '@/lib/utils'

export function LoadScaleLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-[10px] text-muted', className)}>
      <span>Suave</span>
      {LOAD_LEVEL_OPACITY.map((_, level) => (
        <span
          key={level}
          className="rounded-[2px]"
          style={{ width: 10, height: 10, backgroundColor: loadFill(level) }}
        />
      ))}
      <span>Duro</span>
    </div>
  )
}
