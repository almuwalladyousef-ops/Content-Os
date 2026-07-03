/**
 * Instagram Login API ("API with Instagram Login") — ONE auth for all account
 * types, on one Meta app (the personal app; env INSTAGRAM_APP_ID/SECRET).
 *
 * No Facebook Pages, no page tokens, no hardcoded accounts: the user logs in
 * with any Instagram professional account (Business or Creator) and the token
 * itself identifies the account. All Graph calls go to graph.instagram.com.
 */

export const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com/v21.0'

type GraphError = {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
}

type GraphResponse<T> = T & { error?: GraphError }

type MediaProbeResponse = {
  data?: unknown[]
}

type TokenExchangeResponse = {
  access_token?: string
  user_id?: string | number
  token_type?: string
  expires_in?: number
  permissions?: string[] | string
  error?: GraphError
  error_message?: string
}

type ProfileResponse = {
  id?: string
  user_id?: string
  username?: string
  account_type?: string
}

export function instagramGraphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

async function fetchGraph<T>(path: string, params: Record<string, string>): Promise<GraphResponse<T>> {
  const res = await fetch(instagramGraphUrl(path, params))
  return await res.json() as GraphResponse<T>
}

export function getInstagramAppCredentials() {
  // FACEBOOK_APP_ID/SECRET are the legacy names (pre-rename) still set in
  // deployed environments; accept both so existing deployments keep working.
  const appId = process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET
  return { appId, appSecret }
}

/** Scopes for the single connect button: posting + analytics + DM automation. */
export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
]

export function instagramAuthorizeUrl(params: { appId: string; redirectUri: string; state?: string }) {
  const qs = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    enable_fb_login: '0',
    force_authentication: '1',
  })
  if (params.state) qs.set('state', params.state)
  return `https://www.instagram.com/oauth/authorize?${qs}`
}

/** Authorization code → short-lived token (api.instagram.com, form-encoded POST). */
export async function exchangeInstagramCodeForToken(params: {
  code: string
  redirectUri: string
  appId: string
  appSecret: string
}): Promise<TokenExchangeResponse> {
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: params.appId,
      client_secret: params.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri,
      code: params.code,
    }),
  })
  return await res.json() as TokenExchangeResponse
}

/** Short-lived → long-lived (~60 days). */
export async function exchangeForLongLivedToken(params: {
  accessToken: string
  appSecret: string
}): Promise<TokenExchangeResponse> {
  const res = await fetch(
    `${INSTAGRAM_GRAPH_BASE.replace(/\/v[\d.]+$/, '')}/access_token?` + new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: params.appSecret,
      access_token: params.accessToken,
    })
  )
  return await res.json() as TokenExchangeResponse
}

/** Refreshes an unexpired long-lived token for another ~60 days. */
export async function refreshLongLivedToken(accessToken: string): Promise<TokenExchangeResponse> {
  const res = await fetch(
    `${INSTAGRAM_GRAPH_BASE.replace(/\/v[\d.]+$/, '')}/refresh_access_token?` + new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken,
    })
  )
  return await res.json() as TokenExchangeResponse
}

/** The token's own professional account (id used for /media + /media_publish). */
export async function getInstagramProfile(accessToken: string): Promise<GraphResponse<ProfileResponse>> {
  return await fetchGraph<ProfileResponse>('me', {
    fields: 'id,user_id,username,account_type',
    access_token: accessToken,
  })
}

async function canReadMedia(accountId: string, token: string) {
  const data = await fetchGraph<MediaProbeResponse>(`${accountId}/media`, {
    fields: 'id',
    limit: '1',
    access_token: token,
  })
  return { ok: !data.error, error: data.error }
}

/**
 * Verifies the saved account ID can read its media; if not, re-resolves it
 * from the token itself (`/me`). With Instagram Login the token maps to
 * exactly one account, so this is the whole recovery story.
 */
export async function resolveInstagramAccountId(accessToken: string, savedAccountId: string): Promise<{
  accountId: string
  changed: boolean
  mediaError?: GraphError
}> {
  const token = accessToken?.trim()
  const saved = savedAccountId?.trim()
  if (!token || !saved) return { accountId: saved, changed: false }

  const probe = await canReadMedia(saved, token)
  if (probe.ok) return { accountId: saved, changed: false }

  const profile = await getInstagramProfile(token)
  const resolvedId = profile.user_id ?? profile.id
  if (!resolvedId || resolvedId === saved) {
    return { accountId: saved, changed: false, mediaError: probe.error }
  }

  const resolvedProbe = await canReadMedia(resolvedId, token)
  if (!resolvedProbe.ok) {
    return { accountId: saved, changed: false, mediaError: resolvedProbe.error }
  }

  return { accountId: resolvedId, changed: true }
}

export function instagramGraphErrorMessage(prefix: string, error?: GraphError) {
  if (!error) return prefix
  const code = error.code ? `#${error.code}` : 'Graph API'
  const subcode = error.error_subcode ? `/${error.error_subcode}` : ''
  return `${prefix}: (${code}${subcode}) ${error.message ?? 'Unknown Instagram error'}`
}
