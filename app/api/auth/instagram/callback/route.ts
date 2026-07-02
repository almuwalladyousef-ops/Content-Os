import { NextRequest, NextResponse } from 'next/server'
import { saveInstagramConnection } from '@/lib/connections'
import {
  exchangeFacebookCodeForToken,
  exchangeForLongLivedToken,
  findInstagramAccountConnection,
  getInstagramAppCredentials,
} from '@/lib/instagram'
import { getBaseUrl } from '@/lib/oauth'

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req)
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error') ?? req.nextUrl.searchParams.get('error_message')

  if (error || !code) {
    return NextResponse.redirect(new URL(`/settings?ig_error=${encodeURIComponent(error ?? 'no_code')}`, req.url))
  }

  const { appId, appSecret } = getInstagramAppCredentials()
  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL(`/settings?ig_error=${encodeURIComponent('Instagram app not configured. Set FACEBOOK_APP_ID / FACEBOOK_APP_SECRET.')}`, req.url)
    )
  }

  const redirectUri = `${base}/api/auth/instagram/callback`
  const shortToken = await exchangeFacebookCodeForToken({ code, redirectUri, appId, appSecret })
  if (!shortToken.access_token) {
    return NextResponse.redirect(new URL(`/settings?ig_error=${encodeURIComponent(shortToken.error?.message ?? 'token_exchange_failed')}`, req.url))
  }

  const longToken = await exchangeForLongLivedToken({ accessToken: shortToken.access_token, appId, appSecret })
  const accessToken = longToken.access_token ?? shortToken.access_token

  const connection = await findInstagramAccountConnection(accessToken)
  if (!connection) {
    return NextResponse.redirect(
      new URL(`/settings?ig_error=${encodeURIComponent('No Instagram Business or Creator account found. Connect your Instagram account to a Facebook Page you manage, then try again.')}`, req.url)
    )
  }

  await saveInstagramConnection({
    access_token: connection.accessToken,
    account_id: connection.accountId,
    username: connection.username,
  })

  return NextResponse.redirect(new URL('/settings?ig_connected=1', req.url))
}
