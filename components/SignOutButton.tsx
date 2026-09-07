'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    setLoading(true)
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      <LogOut aria-hidden className="h-4 w-4" />
      <span>Salir</span>
    </button>
  )
}
