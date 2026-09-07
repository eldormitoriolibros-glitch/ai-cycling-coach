export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentId = 'cyan' | 'indigo' | 'violet' | 'emerald' | 'rose' | 'slate' | 'orange'

export const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'system', label: 'Sistema' },
]

export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'slate', label: 'Grafito', swatch: '#64748b' },
  { id: 'cyan', label: 'Cian', swatch: '#06b6d4' },
  { id: 'indigo', label: 'Índigo', swatch: '#6366f1' },
  { id: 'violet', label: 'Violeta', swatch: '#8b5cf6' },
  { id: 'emerald', label: 'Verde', swatch: '#10b981' },
  { id: 'rose', label: 'Frambuesa', swatch: '#f43f5e' },
  { id: 'orange', label: 'Naranja', swatch: '#f97316' },
]

export const DEFAULT_MODE: ThemeMode = 'dark'
export const DEFAULT_ACCENT: AccentId = 'slate'

export const MODE_KEY = 'trainer:theme-mode'
export const ACCENT_KEY = 'trainer:accent'

export function applyTheme(mode: ThemeMode, accent: AccentId) {
  const root = document.documentElement
  const dark = mode === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark'
  root.classList.toggle('dark', dark)
  root.dataset.accent = accent
}

/** Runs before first paint so the stored theme doesn't flash the default one. */
export const themeInitScript = `(function(){try{
var m=localStorage.getItem('${MODE_KEY}')||'${DEFAULT_MODE}';
var a=localStorage.getItem('${ACCENT_KEY}')||'${DEFAULT_ACCENT}';
var d=m==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:m!=='light';
document.documentElement.classList.toggle('dark',d);
document.documentElement.setAttribute('data-accent',a);
}catch(e){}})();`
