import { readDB } from './driveDB.js'

const INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0'
const instagramLoginAccountCache = new Map()

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

async function getInstagramLoginAccount(token) {
  if (instagramLoginAccountCache.has(token)) {
    return instagramLoginAccountCache.get(token)
  }

  const res = await fetch(`${INSTAGRAM_BASE}/me?fields=id,user_id,username,account_type&access_token=${encodeURIComponent(token)}`)
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Could not resolve Instagram Login account')
  }

  instagramLoginAccountCache.set(token, json)
  return json
}

// Accounts come ONLY from Instagram Login tokens stored by the unified
// /api/auth/instagram/callback (keys `WORKSPACE_TOKEN:ig-<igUserId>`), plus any
// legacy workspace-linked tokens. No hardcoded Business/Personal env buckets.
export async function getAccountsWithStoredTokens() {
  const db = await readDB()
  const storedTokens = db.storedTokens || {}
  const appSecret = process.env.INSTAGRAM_APP_SECRET

  const seen = new Set()
  const accounts = []

  // Instagram Login accounts written by the unified auth callback.
  for (const [key, record] of Object.entries(storedTokens)) {
    if (!key.startsWith('WORKSPACE_TOKEN:ig-') || !record?.token) continue
    const igId = record.meta?.igUserId || key.replace('WORKSPACE_TOKEN:ig-', '')
    if (seen.has(igId)) continue
    seen.add(igId)
    accounts.push({
      key,
      name: record.meta?.username ? `@${record.meta.username}` : igId,
      igId,
      pageId: null,
      token: record.token,
      appSecret,
      username: record.meta?.username || null,
    })
  }

  // Legacy: workspaces that carry their own igId + stored token.
  for (const workspace of db.workspaces || []) {
    if (!workspace.igId || seen.has(workspace.igId)) continue
    const tokenKey = workspace.tokenKey || `WORKSPACE_TOKEN:${workspace.id}`
    const record = storedTokens[tokenKey]
    if (!record?.token) continue
    seen.add(workspace.igId)
    accounts.push({
      key: tokenKey,
      name: workspace.name,
      igId: workspace.igId,
      pageId: workspace.pageId || record.meta?.pageId || null,
      token: record.token,
      appSecret,
      workspaceId: workspace.id,
      username: workspace.igUsername || record.meta?.igUsername || null,
    })
  }

  return accounts
}

// Kept for API shape compatibility; env-backed accounts no longer exist.
export function getAccounts() {
  return []
}

export function getAccountByIgId(igId) {
  return getAccounts().find(a => a.igId === igId)
}

export async function getAccountByIgIdWithStoredToken(igId) {
  const accounts = await getAccountsWithStoredTokens()
  return accounts.find(a => a.igId === igId)
}

export async function resolveAccountForWebhookId(webhookId) {
  if (!webhookId) return null

  const accounts = await getAccountsWithStoredTokens()
  const directMatch = accounts.find(a => a.igId === webhookId || a.pageId === webhookId)
  if (directMatch) return directMatch

  for (const account of accounts) {
    if (!isInstagramLoginToken(account.token)) continue

    try {
      const igAccount = await getInstagramLoginAccount(account.token)
      if (igAccount.id === webhookId || igAccount.user_id === webhookId) {
        return {
          ...account,
          instagramLoginId: igAccount.id,
          instagramUserId: igAccount.user_id,
          username: igAccount.username,
        }
      }
    } catch {
      // Ignore account resolution failures; callers log unresolved webhook IDs.
    }
  }

  return null
}
