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
            <span className="hidden opacity-70 sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        )}
      </div>
    </nav>
  )
}
