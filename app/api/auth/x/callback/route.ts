import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { saveXConnection, COOKIE_OPTS } from '@/lib/connections'
import { decrypt } from '@/lib/crypto'
import { getBaseUrl } from '@/lib/oauth'

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req)
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  const fail = (msg: string) =>
    NextResponse.redirect(`${base}/settings?x_error=${encodeURIComponent(msg)}`)

  if (error || !code) return fail(error ?? 'no_code')

  // Recover the PKCE verifier + CSRF state stashed by the connect route.
  const jar = await cookies()
  const stashRaw = jar.get('cms_x_oauth')?.value
  jar.set('cms_x_oauth', '', { ...COOKIE_OPTS, maxAge: 0 })
  let stash: { verifier: string; state: string } | null = null
  try {
    if (stashRaw) stash = JSON.parse(decrypt(stashRaw))
  } catch { /* fall through */ }
  if (!stash?.verifier) return fail('Login session expired — press Connect again.')
  if (stash.state !== state) return fail('State mismatch — press Connect again.')

  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${base}/api/auth/x/callback`,
      code_verifier: stash.verifier,
      client_id: process.env.X_CLIENT_ID!,
    }),
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    return fail(tokenData.error_description ?? tokenData.error ?? JSON.stringify(tokenData))
  }

  let username = ''
  try {
    const userRes = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const userData = await userRes.json()
    username = userData.data?.username ?? ''
  } catch { /* non-fatal */ }

  await saveXConnection({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in ?? 7200) * 1000,
    username,
  })

  return NextResponse.redirect(new URL('/settings?x_connected=1', req.url))
}
