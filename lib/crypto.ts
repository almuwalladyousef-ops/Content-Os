import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Shared symmetric encryption used for connection cookies (lib/connections.ts)
 * and the scheduled-post queue (lib/schedule-store.ts). AES-256-GCM keyed off
 * NEXTAUTH_SECRET so anything at rest (cookies, the Blob queue) is unreadable
 * without the server secret.
 */

let warnedDevKey = false

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
  if (!secret) {
    // Local dev without a .env: fall back to a fixed key instead of breaking
    // every feature that persists state (workspaces, schedule queue). In
    // production set NEXTAUTH_SECRET (openssl rand -base64 32).
    if (!warnedDevKey) {
      warnedDevKey = true
      console.warn('[crypto] NEXTAUTH_SECRET not set — using an insecure dev-only key')
    }
    return Buffer.from('contentos-dev-key-not-for-production!!').subarray(0, 32)
  }
  const buf = Buffer.from(secret, 'base64')
  return buf.length >= 32 ? buf.subarray(0, 32) : Buffer.concat([buf, Buffer.alloc(32 - buf.length)])
}

export function encrypt(text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decrypt(text: string): string {
  const [ivHex, tagHex, encHex] = text.split(':')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8')
}
