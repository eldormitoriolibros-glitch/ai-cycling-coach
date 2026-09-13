'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavLink = { href: string; label: string }

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function linkClass(active: boolean): string {
  return cn(
    'shrink-0 rounded-full px-3 py-1.5 text-sm transition',
    active
      ? 'bg-accent-500/20 font-medium text-accent-300 ring-1 ring-inset ring-accent-500/40'
      : 'text-slate-300 hover:bg-white/5 hover:text-white'
  )
}

export function NavLinks({
  daily,
  more,
}: {
  daily: NavLink[]
  more: NavLink[]
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const moreActive = more.some((link) => isActive(pathname, link.href))

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="flex items-center gap-1 px-1 pb-2 sm:pb-2.5">
      <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
        {daily.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(pathname, link.href) ? 'page' : undefined}
            className={linkClass(isActive(pathname, link.href))}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div ref={ref} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(linkClass(moreActive), 'inline-flex items-center gap-1')}
        >
          Más
          <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-[60] mt-1 min-w-[12rem] rounded-xl border border-white/10 bg-slate-900 p-1.5 text-white shadow-xl"
          >
            {more.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-3 py-2 text-sm transition hover:bg-white/10',
                  isActive(pathname, link.href) ? 'font-medium text-accent-300' : 'text-slate-100'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
