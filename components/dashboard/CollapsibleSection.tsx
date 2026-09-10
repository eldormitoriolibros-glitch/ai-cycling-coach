'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  summaryInteractive = false,
  children,
  className,
}: {
  title: string
  summary?: React.ReactNode
  defaultOpen?: boolean
  /** When true, clicks on the collapsed summary do not toggle the section. */
  summaryInteractive?: boolean
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section
      className={cn(
        'rounded-xl border border-surface bg-surface shadow-sm transition hover:border-accent-500/30',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
      >
        <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-accent-400 to-accent-600" />
          {title}
        </h2>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted transition', open && 'rotate-180')}
        />
      </button>
      {!open && summary ? (
        summaryInteractive ? (
          <div className="px-4 pb-4">{summary}</div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full px-4 pb-4 text-left"
          >
            {summary}
          </button>
        )
      ) : null}
      {open ? <div className="border-t border-surface px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  )
}
