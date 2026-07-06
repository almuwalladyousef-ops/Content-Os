import { updateDoc } from './drive-db'
import { encrypt, decrypt } from './crypto'

/**
 * Desktop OAuth hand-off.
 *
 * Inside the Content OS desktop app (a WKWebView), OAuth providers refuse to
 * load, so the connect flow runs in the user's real browser (Chrome). But
 * connections live in per-browser encrypted cookies — completing OAuth in
 * Chrome would strand the connection there. Bridge: the callback (in Chrome)
 * stashes the fresh connection here, keyed by a one-time nonce the app
 * generated; the app's settings page polls /api/auth/handoff with that nonce
 * and adopts the connection into its own cookie session.
 *
 * Storage: the shared Drive JSON-DB (section `handoff`). Each entry is
 * AES-encrypted with NEXTAUTH_SECRET (same as everything at rest),
 * single-use (deleted on first read), and expires after 10 minutes.
 */

const SECTION = 'handoff'
const MAX_AGE_MS = 10 * 60 * 1000
const NONCE_RE = /^[a-f0-9][a-f0-9-]{14,62}[a-f0-9]$/i

export type HandoffPlatform = 'google' | 'instagram' | 'tiktok'

export interface HandoffPayload {
  platform: HandoffPlatform
  data: unknown
  ts: number
}

/** Doc shape: nonce → encrypted HandoffPayload. */
type HandoffDoc = Record<string, string>

export function isValidNonce(nonce: string): boolean {
  return NONCE_RE.test(nonce)
}

function pruneExpired(doc: HandoffDoc): HandoffDoc {
  const next: HandoffDoc = {}
  for (const [nonce, enc] of Object.entries(doc)) {
    try {
      const payload = JSON.parse(decrypt(enc)) as HandoffPayload
      if (Date.now() - payload.ts <= MAX_AGE_MS) next[nonce] = enc
    } catch { /* drop unreadable entries */ }
  }
  return next
}

export async function stashHandoff(nonce: string, platform: HandoffPlatform, data: unknown): Promise<void> {
  if (!isValidNonce(nonce)) return
  const payload: HandoffPayload = { platform, data, ts: Date.now() }
  await updateDoc<HandoffDoc>(SECTION, {}, (doc) => ({
    ...pruneExpired(doc),
    [nonce]: encrypt(JSON.stringify(payload)),
  }))
}

/** Reads AND deletes the hand-off entry (single-use). Null if absent/expired. */
export async function takeHandoff(nonce: string): Promise<HandoffPayload | null> {
  if (!isValidNonce(nonce)) return null
  let taken: HandoffPayload | null = null
  try {
    await updateDoc<HandoffDoc>(SECTION, {}, (doc) => {
      const pruned = pruneExpired(doc)
      const enc = pruned[nonce]
      if (enc) {
        try {
          taken = JSON.parse(decrypt(enc)) as HandoffPayload
        } catch { /* corrupt — just drop it */ }
        delete pruned[nonce]
      }
      return pruned
    })
  } catch {
    return null
  }
  return taken
}

/** Pulls a `ho_<nonce>` hand-off nonce out of an OAuth state value, if any. */
export function nonceFromState(state: string | null): string {
  if (state?.startsWith('ho_')) {
    const nonce = state.slice(3)
    if (isValidNonce(nonce)) return nonce
  }
  return ''
}
