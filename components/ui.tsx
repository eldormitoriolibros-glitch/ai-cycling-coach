import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Button({
  children,
  loading = false,
  variant = 'primary',
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-surface text-foreground border border-surface hover:brightness-95',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className
      )}
    >
      {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Alert({
  variant,
  children,
}: {
  variant: 'error' | 'success' | 'info'
  children: React.ReactNode
}) {
  if (!children) return null

  const variants = {
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  }

  return (
    <p
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-sm', variants[variant])}
    >
      {children}
    </p>
  )
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const controlStyles =
  'w-full rounded-md border border-surface px-3 py-2 text-sm shadow-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-slate-900 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlStyles, className)} />
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlStyles, className)} />
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-surface bg-surface p-6 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
