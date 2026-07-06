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
 * Storage: a reserved `__handoff` key inside the existing `dm` Drive-DB doc.
 * A dedicated `handoff` section would need drive-db to CREATE handoff.json,
 * which the service account cannot do (no storage quota on service accounts);
 * the dm doc already exists, so writes there always work. Each entry is
 * AES-encrypted with NEXTAUTH_SECRET (same as everything at rest),
 * single-use (deleted on first read), and expires after 10 minutes.
 */

const SECTION = 'dm'
const KEY = '__handoff'
const MAX_AGE_MS = 10 * 60 * 1000
const NONCE_RE = /^[a-f0-9][a-f0-9-]{14,62}[a-f0-9]$/i

export type HandoffPlatform = 'google' | 'instagram' | 'tiktok'

export interface HandoffPayload {
  platform: HandoffPlatform
  data: unknown
  ts: number
}

/** Hand-off map shape: nonce → encrypted HandoffPayload. */
type HandoffDoc = Record<string, string>
/** The host doc (`dm`) we piggyback on — everything else in it is left alone. */
type HostDoc = Record<string, unknown>

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
  await updateDoc<HostDoc>(SECTION, {}, (db) => ({
    ...db,
    [KEY]: {
      ...pruneExpired((db[KEY] as HandoffDoc) ?? {}),
      [nonce]: encrypt(JSON.stringify(payload)),
    },
  }))
}

/** Reads AND deletes the hand-off entry (single-use). Null if absent/expired. */
export async function takeHandoff(nonce: string): Promise<HandoffPayload | null> {
  if (!isValidNonce(nonce)) return null
  let taken: HandoffPayload | null = null
  try {
    await updateDoc<HostDoc>(SECTION, {}, (db) => {
      const pruned = pruneExpired((db[KEY] as HandoffDoc) ?? {})
      const enc = pruned[nonce]
      if (enc) {
        try {
          taken = JSON.parse(decrypt(enc)) as HandoffPayload
        } catch { /* corrupt — just drop it */ }
        delete pruned[nonce]
      }
      return { ...db, [KEY]: pruned }
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
