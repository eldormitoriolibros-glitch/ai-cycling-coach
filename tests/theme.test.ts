import { describe, expect, it } from 'vitest'
import { ACCENT_MARK, faviconSvg, resolveThemeMode } from '@/lib/theme'

describe('faviconSvg', () => {
  it('paints the mark with the selected accent', () => {
    expect(faviconSvg('rose')).toContain(ACCENT_MARK.rose.from)
    expect(faviconSvg('rose')).toContain(ACCENT_MARK.rose.to)
    expect(faviconSvg('slate')).toContain('#94a3b8')
  })
})

describe('resolveThemeMode', () => {
  it('keeps an explicit light or dark choice', () => {
    expect(resolveThemeMode('light')).toBe('light')
    expect(resolveThemeMode('dark')).toBe('dark')
  })
})
