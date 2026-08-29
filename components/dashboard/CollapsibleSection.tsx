'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: {
  title: string
  summary?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className={cn('group rounded-lg border border-surface bg-surface shadow-sm', className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
          {summary ? <div className="mt-2">{summary}</div> : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-surface px-4 pb-4 pt-3">{children}</div>
    </details>
  )
}
