import { describe, expect, it } from 'vitest'
import { rateLimit } from '@/lib/rate-limit'

describe('rateLimit', () => {
  it('allows up to the limit and then refuses', () => {
    const key = `test-${Math.random()}`
    expect(rateLimit(key, 3, 60_000).ok).toBe(true)
    expect(rateLimit(key, 3, 60_000).ok).toBe(true)
    expect(rateLimit(key, 3, 60_000).ok).toBe(true)

    const refused = rateLimit(key, 3, 60_000)
    expect(refused.ok).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps separate counters per key', () => {
    const suffix = Math.random()
    expect(rateLimit(`a-${suffix}`, 1, 60_000).ok).toBe(true)
    expect(rateLimit(`a-${suffix}`, 1, 60_000).ok).toBe(false)
    expect(rateLimit(`b-${suffix}`, 1, 60_000).ok).toBe(true)
  })

  it('starts a new window once the old one expired', () => {
    const key = `expiry-${Math.random()}`
    expect(rateLimit(key, 1, 1).ok).toBe(true)
    const start = Date.now()
    while (Date.now() - start < 5) {
      // busy wait past the 1 ms window
    }
    expect(rateLimit(key, 1, 1).ok).toBe(true)
  })
})
