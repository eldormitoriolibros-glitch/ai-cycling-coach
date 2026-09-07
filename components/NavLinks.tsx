'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname()

  return (
    <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-2 sm:pb-2.5">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
              active
                ? 'bg-accent-500/20 font-medium text-accent-300 ring-1 ring-inset ring-accent-500/40'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </div>
  )
}
