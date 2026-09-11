'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import {
  ACCENTS,
  ACCENT_KEY,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  MODES,
  MODE_KEY,
  applyTheme,
  isAccentId,
  resolveThemeMode,
  type AccentId,
  type ThemeMode,
} from '@/lib/theme'

export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_MODE)
  const [accent, setAccent] = useState<AccentId>(DEFAULT_ACCENT)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_KEY)
    const storedAccent = localStorage.getItem(ACCENT_KEY)
    const resolved = resolveThemeMode(storedMode)
    const nextAccent = isAccentId(storedAccent) ? storedAccent : DEFAULT_ACCENT
    setMode(resolved)
    setAccent(nextAccent)
    if (storedMode === 'system') localStorage.setItem(MODE_KEY, resolved)
    applyTheme(resolved, nextAccent)
  }, [])

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

  const pickMode = (next: ThemeMode) => {
    setMode(next)
    localStorage.setItem(MODE_KEY, next)
    applyTheme(next, accent)
  }

  const pickAccent = (next: AccentId) => {
    setAccent(next)
    localStorage.setItem(ACCENT_KEY, next)
    applyTheme(mode, next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tema y colores"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
      >
        <Palette aria-hidden className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-60 rounded-xl border border-surface bg-surface p-3 text-foreground shadow-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Modo</p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-surface p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  mode === m.id ? 'bg-accent-500 text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Acento</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pickAccent(a.id)}
                title={a.label}
                aria-label={a.label}
                aria-pressed={accent === a.id}
                className="flex h-9 items-center justify-center rounded-lg border border-surface transition hover:scale-105"
                style={{ backgroundColor: a.swatch }}
              >
                {accent === a.id && <Check aria-hidden className="h-4 w-4 text-white drop-shadow" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
