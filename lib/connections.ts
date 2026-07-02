import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { encrypt, decrypt } from './crypto'

/**
 * Unified connection store for ContentOS.
 *
 * Every platform the user authorizes (YouTube/Google, Instagram, TikTok) is
 * stored in its own encrypted, http-only cookie. There is exactly ONE account
 * per platform — connecting is a single OAuth click, with nothing to paste.
 *
 * Tokens are NEVER stored in Google Drive and the platforms do not depend on
 * each other: you can connect Instagram or TikTok without connecting Google.
 */

// ── crypto ──────────────────────────────────────────────────────────────────
// (encrypt/decrypt live in lib/crypto.ts so the schedule queue can reuse them.)

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
}

// ── Workspaces ───────────────────────────────────────────────────────────────
//
// A workspace is an independent set of platform connections. Switching the
// active workspace swaps which encrypted cookies the connection helpers read
// and write. The "default" workspace uses the original un-suffixed cookie
// names, so connections made before workspaces existed keep working.

const WORKSPACES_COOKIE = 'cms_workspaces'
export const DEFAULT_WORKSPACE_ID = 'default'

export interface Workspace {
  id: string
  name: string
}

export interface WorkspaceState {
  workspaces: Workspace[]
  activeId: string
}

type Jar = Awaited<ReturnType<typeof cookies>>

function defaultWorkspaceState(): WorkspaceState {
  return { workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: 'Workspace 1' }], activeId: DEFAULT_WORKSPACE_ID }
}

function readWorkspaceState(jar: Jar): WorkspaceState {
  const val = jar.get(WORKSPACES_COOKIE)?.value
  if (val) {
    try {
      const parsed = JSON.parse(decrypt(val)) as WorkspaceState
      if (parsed?.workspaces?.length && parsed.activeId) {
        // Make sure the active id actually exists; otherwise fall back.
        if (parsed.workspaces.some(w => w.id === parsed.activeId)) return parsed
        return { ...parsed, activeId: parsed.workspaces[0].id }
      }
    } catch { /* fall through */ }
  }
  return defaultWorkspaceState()
}

/** Scopes a base cookie name to a workspace. Default workspace keeps the bare name. */
function scopedName(base: string, workspaceId: string): string {
  return workspaceId === DEFAULT_WORKSPACE_ID ? base : `${base}__${workspaceId}`
}

async function readCookie<T>(base: string): Promise<T | null> {
  const jar = await cookies()
  const name = scopedName(base, readWorkspaceState(jar).activeId)
  const val = jar.get(name)?.value
  if (!val) return null
  try {
    return JSON.parse(decrypt(val)) as T
  } catch {
    return null
  }
}

async function writeCookie(base: string, value: unknown): Promise<void> {
  const jar = await cookies()
  const name = scopedName(base, readWorkspaceState(jar).activeId)
  jar.set(name, encrypt(JSON.stringify(value)), COOKIE_OPTS)
}

async function clearCookie(base: string): Promise<void> {
  const jar = await cookies()
  const name = scopedName(base, readWorkspaceState(jar).activeId)
  jar.set(name, '', { ...COOKIE_OPTS, maxAge: 0 })
}

const now = () => Math.floor(Date.now() / 1000)

// ── Google (YouTube · Drive · Gmail) ────────────────────────────────────────

const GOOGLE_COOKIE = 'cms_google'

export interface GoogleAccount {
  email: string
  access_token: string
  refresh_token: string
  expires_at: number // unix seconds
}

export async function saveGoogleAccount(acc: GoogleAccount): Promise<void> {
  await writeCookie(GOOGLE_COOKIE, acc)
}

export async function clearGoogleAccount(): Promise<void> {
  await clearCookie(GOOGLE_COOKIE)
}

async function refreshGoogleToken(acc: GoogleAccount): Promise<GoogleAccount> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Google token refresh failed: ${JSON.stringify(json)}`)
  return {
    ...acc,
    access_token: json.access_token,
    expires_at: now() + (json.expires_in ?? 3600),
  }
}

/** Returns a valid Google access token (refreshing if near expiry) or null. */
export async function getGoogleAccount(): Promise<{ accessToken: string; email: string } | null> {
  const acc = await readCookie<GoogleAccount>(GOOGLE_COOKIE)
  if (!acc?.access_token) return null
  try {
    if (acc.refresh_token && acc.expires_at - now() < 300) {
      const refreshed = await refreshGoogleToken(acc)
      await saveGoogleAccount(refreshed)
      return { accessToken: refreshed.access_token, email: refreshed.email }
    }
    return { accessToken: acc.access_token, email: acc.email }
  } catch {
    // Refresh failed — fall back to the existing token; the caller surfaces any API error.
    return { accessToken: acc.access_token, email: acc.email }
  }
}

// ── Instagram (Graph API) ───────────────────────────────────────────────────

const INSTAGRAM_COOKIE = 'cms_instagram'

export interface InstagramConnection {
  access_token: string
  account_id: string
  username?: string
}

export async function saveInstagramConnection(conn: InstagramConnection): Promise<void> {
  await writeCookie(INSTAGRAM_COOKIE, conn)
}

export async function clearInstagramConnection(): Promise<void> {
  await clearCookie(INSTAGRAM_COOKIE)
}

export async function getInstagramConnection(): Promise<{
  accessToken: string
  accountId: string
  username?: string
} | null> {
  const conn = await readCookie<InstagramConnection>(INSTAGRAM_COOKIE)
  if (!conn?.access_token || !conn?.account_id) return null
  return { accessToken: conn.access_token, accountId: conn.account_id, username: conn.username }
}

// ── TikTok (Content Posting API) ────────────────────────────────────────────

const TIKTOK_COOKIE = 'cms_tiktok'

export interface TikTokConnection {
  access_token: string
  refresh_token?: string
  expires_at?: number // unix ms
  display_name?: string
}

export async function saveTikTokConnection(conn: TikTokConnection): Promise<void> {
  await writeCookie(TIKTOK_COOKIE, conn)
}

export async function clearTikTokConnection(): Promise<void> {
  await clearCookie(TIKTOK_COOKIE)
}

async function refreshTikTokToken(conn: TikTokConnection): Promise<TikTokConnection | null> {
  if (!conn.refresh_token) return null
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: conn.refresh_token,
      }),
    })
    const data = await res.json()
    const access = data.access_token ?? data.data?.access_token
    if (!access) return null
    return {
      access_token: access,
      refresh_token: data.refresh_token ?? data.data?.refresh_token ?? conn.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? data.data?.expires_in ?? 86400) * 1000,
      display_name: conn.display_name,
    }
  } catch {
    return null
  }
}

/**
 * Tells TikTok to forget this app's authorization for the stored account, so the
 * next connect shows the account picker / consent again instead of silently
 * re-approving the same account. Best-effort.
 */
export async function revokeTikTokToken(): Promise<void> {
  const conn = await readCookie<TikTokConnection>(TIKTOK_COOKIE)
  if (!conn?.access_token) return
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) return
  try {
    await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        token: conn.access_token,
      }),
    })
  } catch { /* best effort */ }
}

export async function getTikTokConnection(): Promise<{
  accessToken: string
  displayName?: string
} | null> {
  const conn = await readCookie<TikTokConnection>(TIKTOK_COOKIE)
  if (!conn?.access_token) return null

  const expiresAt = conn.expires_at ?? 0
  const isExpired = expiresAt > 0 && Date.now() > expiresAt - 60_000 // refresh 1 min early
  if (isExpired && conn.refresh_token) {
    const refreshed = await refreshTikTokToken(conn)
    if (refreshed) {
      await saveTikTokConnection(refreshed)
      return { accessToken: refreshed.access_token, displayName: refreshed.display_name }
    }
  }
  return { accessToken: conn.access_token, displayName: conn.display_name }
}

// ── Aggregate status (for Settings / shell) ─────────────────────────────────

export async function getConnectionsStatus(): Promise<{
  youtube: { email: string } | null
  instagram: { username: string | null } | null
  tiktok: { displayName: string | null } | null
}> {
  const jar = await cookies()
  const activeId = readWorkspaceState(jar).activeId
  const read = <T>(base: string): T | null => {
    const val = jar.get(scopedName(base, activeId))?.value
    if (!val) return null
    try {
      return JSON.parse(decrypt(val)) as T
    } catch {
      return null
    }
  }

  const google = read<GoogleAccount>(GOOGLE_COOKIE)
  const ig = read<InstagramConnection>(INSTAGRAM_COOKIE)
  const tt = read<TikTokConnection>(TIKTOK_COOKIE)

  return {
    youtube: google?.email ? { email: google.email } : null,
    instagram: ig?.access_token && ig?.account_id ? { username: ig.username ?? null } : null,
    tiktok: tt?.access_token ? { displayName: tt.display_name ?? null } : null,
  }
}

// ── Raw snapshots (for scheduled posts) ──────────────────────────────────────
//
// A scheduled post fires later from the cron worker, which has no cookies. So at
// schedule time we snapshot the FULL stored credentials (including refresh
// tokens) into the encrypted queue. These getters expose the raw cookie payloads
// for that snapshot; the standalone refresh* helpers below let the worker mint
// fresh access tokens from a snapshot without any cookie/session context.

export async function getGoogleAccountRaw(): Promise<GoogleAccount | null> {
  return readCookie<GoogleAccount>(GOOGLE_COOKIE)
}

export async function getInstagramConnectionRaw(): Promise<InstagramConnection | null> {
  return readCookie<InstagramConnection>(INSTAGRAM_COOKIE)
}

export async function getTikTokConnectionRaw(): Promise<TikTokConnection | null> {
  return readCookie<TikTokConnection>(TIKTOK_COOKIE)
}

/** Cookieless Google refresh — returns a fresh access token + unix-seconds expiry. */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Google token refresh failed: ${JSON.stringify(json)}`)
  return { access_token: json.access_token, expires_at: now() + (json.expires_in ?? 3600) }
}

/** Cookieless TikTok refresh — returns fresh tokens (unix-ms expiry) or null. */
export async function refreshTikTokAccessToken(refreshToken: string): Promise<TikTokConnection | null> {
  return refreshTikTokToken({ access_token: '', refresh_token: refreshToken })
}

// ── Workspace management ─────────────────────────────────────────────────────

/** All per-platform connection cookie bases, used when wiping a workspace. */
const CONNECTION_COOKIE_BASES = [GOOGLE_COOKIE, INSTAGRAM_COOKIE, TIKTOK_COOKIE]

export async function getWorkspaces(): Promise<WorkspaceState> {
  const jar = await cookies()
  return readWorkspaceState(jar)
}

async function saveWorkspaceState(state: WorkspaceState): Promise<void> {
  const jar = await cookies()
  jar.set(WORKSPACES_COOKIE, encrypt(JSON.stringify(state)), COOKIE_OPTS)
}

/** Creates a new workspace and makes it active. Returns the updated state. */
export async function createWorkspace(name?: string): Promise<WorkspaceState> {
  const state = await getWorkspaces()
  const id = randomBytes(8).toString('hex')
  const trimmed = name?.trim()
  const workspace: Workspace = {
    id,
    name: trimmed || `Workspace ${state.workspaces.length + 1}`,
  }
  const next: WorkspaceState = {
    workspaces: [...state.workspaces, workspace],
    activeId: id,
  }
  await saveWorkspaceState(next)
  return next
}

export async function renameWorkspace(id: string, name: string): Promise<WorkspaceState> {
  const state = await getWorkspaces()
  const trimmed = name.trim()
  if (!trimmed) return state
  const next: WorkspaceState = {
    ...state,
    workspaces: state.workspaces.map(w => (w.id === id ? { ...w, name: trimmed } : w)),
  }
  await saveWorkspaceState(next)
  return next
}

export async function switchWorkspace(id: string): Promise<WorkspaceState> {
  const state = await getWorkspaces()
  if (!state.workspaces.some(w => w.id === id)) return state
  const next: WorkspaceState = { ...state, activeId: id }
  await saveWorkspaceState(next)
  return next
}

/**
 * Deletes a workspace along with its stored connections. Refuses to delete the
 * last remaining workspace. If the deleted workspace was active, the first
 * remaining workspace becomes active.
 */
export async function deleteWorkspace(id: string): Promise<WorkspaceState> {
  const state = await getWorkspaces()
  if (state.workspaces.length <= 1) return state
  if (!state.workspaces.some(w => w.id === id)) return state

  // Wipe this workspace's connection cookies.
  const jar = await cookies()
  for (const base of CONNECTION_COOKIE_BASES) {
    jar.set(scopedName(base, id), '', { ...COOKIE_OPTS, maxAge: 0 })
  }

  const workspaces = state.workspaces.filter(w => w.id !== id)
  const activeId = state.activeId === id ? workspaces[0].id : state.activeId
  const next: WorkspaceState = { workspaces, activeId }
  await saveWorkspaceState(next)
  return next
}
