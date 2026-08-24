import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { serverEnv } from '@/lib/env'

import 'server-only'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const VERSION = 'v1'

function key() {
  return Buffer.from(serverEnv().TOKEN_ENCRYPTION_KEY, 'base64')
}

/** Returns `v1.<iv>.<authTag>.<ciphertext>`, all base64url. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decrypt(payload: string): string {
  const [version, iv, authTag, ciphertext] = payload.split('.')
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error('Malformed encrypted payload')
  }

  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** Constant-time comparison for webhook secrets and OAuth state. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
