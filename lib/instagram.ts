export const INSTAGRAM_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

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

type PageInstagramResponse = {
  instagram_business_account?: {
    id?: string
    username?: string
  }
}

type AccountsResponse = {
  data?: Array<{
    id?: string
    name?: string
    access_token?: string
    instagram_business_account?: {
      id?: string
      username?: string
    }
  }>
}

type PageIdentityResponse = PageInstagramResponse & {
  id?: string
  name?: string
}

type TokenExchangeResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: GraphError
}

export type InstagramAccountConnection = {
  accessToken: string
  accountId: string
  username?: string
  pageId?: string
  pageName?: string
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
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  return { appId, appSecret }
}

export async function exchangeFacebookCodeForToken(params: {
  code: string
  redirectUri: string
  appId: string
  appSecret: string
}) {
  return await fetchGraph<TokenExchangeResponse>('oauth/access_token', {
    client_id: params.appId,
    client_secret: params.appSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
  })
}

export async function exchangeForLongLivedToken(params: {
  accessToken: string
  appId: string
  appSecret: string
}) {
  return await fetchGraph<TokenExchangeResponse>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: params.appId,
    client_secret: params.appSecret,
    fb_exchange_token: params.accessToken,
  })
}

export async function findInstagramAccountConnection(accessToken: string): Promise<InstagramAccountConnection | null> {
  const accounts = await fetchGraph<AccountsResponse>('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: accessToken,
  })
  if (accounts.error) return null

  const page = accounts.data?.find(item => item.instagram_business_account?.id)
  const accountId = page?.instagram_business_account?.id
  if (!page || !accountId) return null

  return {
    accessToken,
    accountId,
    username: page.instagram_business_account?.username,
    pageId: page.id,
    pageName: page.name,
  }
}

function isMissingMediaEdge(error?: GraphError) {
  return error?.code === 100 && error.message?.toLowerCase().includes('nonexisting field (media)')
}

async function canReadMedia(accountId: string, token: string) {
  const data = await fetchGraph<MediaProbeResponse>(`${accountId}/media`, {
    fields: 'id',
    limit: '1',
    access_token: token,
  })
  return { ok: !data.error, error: data.error }
}

async function resolveFromPage(pageId: string, token: string) {
  const page = await fetchGraph<PageInstagramResponse>(pageId, {
    fields: 'instagram_business_account{id,username}',
    access_token: token,
  })
  return page.instagram_business_account?.id
}

async function resolveFromTokenPage(token: string) {
  const page = await fetchGraph<PageIdentityResponse>('me', {
    fields: 'id,name,instagram_business_account{id,username}',
    access_token: token,
  })
  return page.instagram_business_account?.id
}

async function resolveFromUserPages(token: string, preferredPageId?: string) {
  const accounts = await fetchGraph<AccountsResponse>('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: token,
  })
  if (!accounts.data?.length) return null

  const preferred = preferredPageId ? accounts.data.find(page => page.id === preferredPageId) : null
  if (preferredPageId && !preferred) return null
  return preferred?.instagram_business_account?.id ?? null
}

async function resolveSingleConnectedInstagramAccount(token: string) {
  const accounts = await fetchGraph<AccountsResponse>('me/accounts', {
    fields: 'id,name,instagram_business_account{id,username}',
    access_token: token,
  })
  const connected = accounts.data?.filter(page => page.instagram_business_account?.id) ?? []
  if (connected.length !== 1) return null
  return connected[0].instagram_business_account?.id ?? null
}

/**
 * Verifies the saved Instagram account ID can read its media; if not, tries to
 * resolve the correct Business/Creator account ID from the access token. Returns
 * the (possibly corrected) account ID and whether it changed.
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

  let resolvedId: string | null = null
  if (isMissingMediaEdge(probe.error)) {
    resolvedId = await resolveFromPage(saved, token) ?? null
    resolvedId ??= await resolveFromTokenPage(token) ?? null
    resolvedId ??= await resolveFromUserPages(token, saved)
    resolvedId ??= await resolveSingleConnectedInstagramAccount(token)
  }

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
