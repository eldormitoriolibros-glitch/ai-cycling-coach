'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Field, Input } from '@/components/ui'

type Mode = 'signIn' | 'signUp'

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const next = searchParams.get('next')
  const redirectTo = next?.startsWith('/') && !next.startsWith('//') ? next : '/'

  const isSignUp = mode === 'signUp'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    setError(null)
    setNotice(null)

    if (isSignUp && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Picked up by the handle_new_user() trigger.
            data: { name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          },
        })
        if (signUpError) throw signUpError

        // No session means Supabase requires email confirmation first.
        if (!data.session) {
          setNotice(`Te enviamos un correo a ${email}. Confirmá tu cuenta para continuar.`)
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }

      router.replace(redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(isSignUp ? 'signIn' : 'signUp')
    setError(null)
    setNotice(null)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">{isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}</h2>

      {isSignUp && (
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </Field>
      )}

      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <Field label="Contraseña" hint={isSignUp ? 'Mínimo 8 caracteres.' : undefined}>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          minLength={isSignUp ? 8 : undefined}
          required
        />
      </Field>

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Button type="submit" loading={loading} className="w-full">
        {isSignUp ? 'Registrarse' : 'Entrar'}
      </Button>

      <button
        type="button"
        onClick={switchMode}
        className="text-sm text-slate-600 underline hover:text-slate-900"
      >
        {isSignUp ? 'Ya tengo cuenta' : 'Crear cuenta'}
      </button>
    </form>
  )
}
