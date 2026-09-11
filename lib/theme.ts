export type ThemeMode = 'light' | 'dark'
export type AccentId = 'cyan' | 'indigo' | 'violet' | 'emerald' | 'rose' | 'slate' | 'orange'

export const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
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

/** Header mark: accent-400 → accent-600. */
export const ACCENT_MARK: Record<AccentId, { from: string; to: string }> = {
  slate: { from: '#94a3b8', to: '#475569' },
  cyan: { from: '#22d3ee', to: '#0891b2' },
  indigo: { from: '#818cf8', to: '#4f46e5' },
  violet: { from: '#a78bfa', to: '#7c3aed' },
  emerald: { from: '#34d399', to: '#059669' },
  rose: { from: '#fb7185', to: '#e11d48' },
  orange: { from: '#fb923c', to: '#ea580c' },
}

export const DEFAULT_MODE: ThemeMode = 'dark'
export const DEFAULT_ACCENT: AccentId = 'slate'

export const MODE_KEY = 'trainer:theme-mode'
export const ACCENT_KEY = 'trainer:accent'

export function isAccentId(value: string | null | undefined): value is AccentId {
  return Boolean(value && value in ACCENT_MARK)
}

export function resolveThemeMode(mode: string | null | undefined): ThemeMode {
  if (mode === 'light' || mode === 'dark') return mode
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return DEFAULT_MODE
}

export function faviconSvg(accent: AccentId): string {
  const mark = ACCENT_MARK[accent] ?? ACCENT_MARK.slate
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="mark" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="${mark.from}"/><stop offset="1" stop-color="${mark.to}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#mark)"/><g transform="translate(8 8) scale(2)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></g></svg>`
}

export function applyFavicon(accent: AccentId) {
  const href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(accent))}`
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
  if (links.length === 0) {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
    link.href = href
    return
  }
  links.forEach((link) => {
    link.type = 'image/svg+xml'
    link.href = href
  })
}

export function applyTheme(mode: ThemeMode | 'system', accent: AccentId) {
  const resolved = resolveThemeMode(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.dataset.accent = accent
  applyFavicon(accent)
}

const ACCENT_MARK_JS = JSON.stringify(
  Object.fromEntries(Object.entries(ACCENT_MARK).map(([id, mark]) => [id, [mark.from, mark.to]]))
)

/** Runs before first paint so the stored theme doesn't flash the default one. */
export const themeInitScript = `(function(){try{
var m=localStorage.getItem('${MODE_KEY}')||'${DEFAULT_MODE}';
var a=localStorage.getItem('${ACCENT_KEY}')||'${DEFAULT_ACCENT}';
var d=m==='light'?false:m==='dark'?true:window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark',d);
document.documentElement.setAttribute('data-accent',a);
var marks=${ACCENT_MARK_JS};
var c=marks[a]||marks.slate;
var svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="mark" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="'+c[0]+'"/><stop offset="1" stop-color="'+c[1]+'"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#mark)"/><g transform="translate(8 8) scale(2)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></g></svg>';
var links=document.querySelectorAll('link[rel="icon"]');
for(var i=0;i<links.length;i++) links[i].href='data:image/svg+xml,'+encodeURIComponent(svg);
}catch(e){}})();`
