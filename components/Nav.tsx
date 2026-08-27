import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/SignOutButton'

const LINKS = [
  { href: '/coach', label: 'Entrenador' },
  { href: '/plan', label: 'Plan' },
  { href: '/activities', label: 'Actividades' },
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
    <nav className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
        <Link href="/" className="font-bold">
          AI Cycling Coach
        </Link>
        {user && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:underline">
                {link.label}
              </Link>
            ))}
            <span className="hidden opacity-70 sm:inline">{usernameDisplay}</span>
            <SignOutButton />
          </div>
        )}
      </div>
    </nav>
  )
}
