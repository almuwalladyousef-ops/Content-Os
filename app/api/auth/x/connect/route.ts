import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes, createHash } from 'crypto'
import { getBaseUrl } from '@/lib/oauth'
import { revokeXToken, COOKIE_OPTS } from '@/lib/connections'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  if (!process.env.X_CLIENT_ID) {
    return NextResponse.redirect(
      new URL(`/settings?x_error=${encodeURIComponent('X app not configured. Set X_CLIENT_ID / X_CLIENT_SECRET.')}`, req.url)
    )
  }

  // Revoke any existing authorization so X re-prompts for the account.
  await revokeXToken()

  // OAuth 2.0 PKCE: the verifier must survive until the callback, so stash it
  // (with the CSRF state) in a short-lived encrypted cookie.
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')

  const jar = await cookies()
  jar.set('cms_x_oauth', encrypt(JSON.stringify({ verifier, state })), { ...COOKIE_OPTS, maxAge: 600 })

  const redirectUri = `${getBaseUrl(req)}/api/auth/x/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: redirectUri,
    // media.write is required for the v2 media upload; offline.access for refresh
    // tokens (X access tokens only last ~2 hours).
    scope: 'tweet.read tweet.write users.read media.write offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  return NextResponse.redirect(`https://x.com/i/oauth2/authorize?${params}`)
}
