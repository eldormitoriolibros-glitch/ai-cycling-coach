import Link from 'next/link'
import { Bike } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/SignOutButton'
import { NavLinks } from '@/components/NavLinks'
import { ThemePicker } from '@/components/ThemePicker'

const DAILY = [
  { href: '/', label: 'Hoy' },
  { href: '/coach', label: 'Entrenador' },
  { href: '/plan', label: 'Plan' },
]

const MORE = [
  { href: '/calendar', label: 'Calendario' },
  { href: '/power', label: 'Potencia' },
  { href: '/recovery', label: 'Recuperación' },
  { href: '/profile', label: 'Perfil' },
  { href: '/availability', label: 'Disponibilidad' },
  { href: '/settings', label: 'Conexiones' },
]

export async function Nav() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // prefer profile.username if present
  let usernameDisplay = ''
  if (user) {
    const res = await supabase.from('users').select('username, name, email').eq('id', user.id).maybeSingle()
    if (!res.error) {
      const profile = res.data as any
      if (profile?.username) usernameDisplay = profile.username
      else usernameDisplay = profile?.name ?? (user.email?.includes('@') ? user.email.split('@')[0] : user.email ?? '')
    } else {
      usernameDisplay = user.email?.includes('@') ? user.email.split('@')[0] : user.email ?? ''
    }
  }

  return (
    <header className="sticky top-0 z-40 overflow-visible border-b border-white/10 bg-slate-950/85 text-white backdrop-blur">
      <div className="h-0.5 w-full bg-gradient-to-r from-accent-400 via-accent-600 to-accent-400" />
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg shadow-accent-500/25">
              <Bike aria-hidden className="h-[18px] w-[18px] text-white" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight">
                Cycling <span className="text-accent-400">Coach</span>
              </span>
              <span className="mt-0.5 hidden text-[10px] uppercase tracking-[0.16em] text-slate-400 sm:block">
                Entrená con criterio
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            {user && <span className="hidden text-slate-400 sm:inline">{usernameDisplay}</span>}
            <ThemePicker />
            {user && <SignOutButton />}
          </div>
        </div>
        {user && <NavLinks daily={DAILY} more={MORE} />}
      </div>
    </header>
  )
}
