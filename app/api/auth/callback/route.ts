import { NextRequest, NextResponse } from 'next/server'
import { saveGoogleAccount, type GoogleAccount } from '@/lib/connections'
import { getBaseUrl } from '@/lib/oauth'
import { nonceFromState, stashHandoff } from '@/lib/handoff'

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req)
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL(`/settings?yt_error=${encodeURIComponent(error ?? 'no_code')}`, req.url))
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${base}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL(`/settings?yt_error=${encodeURIComponent(tokens.error_description ?? 'token_exchange')}`, req.url))
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const user = await userRes.json()

  const account: GoogleAccount = {
    email: user.email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
  }
  await saveGoogleAccount(account)

  // Desktop hand-off: this ran in Chrome, so also stash the connection for the
  // Content OS app (polling /api/auth/handoff) to adopt into its own session.
  const nonce = nonceFromState(req.nextUrl.searchParams.get('state'))
  if (nonce) await stashHandoff(nonce, 'google', account)

  return NextResponse.redirect(new URL(`/settings?yt_connected=1${nonce ? '&handoff_done=1' : ''}`, req.url))
}
