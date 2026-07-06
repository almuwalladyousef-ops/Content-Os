import { NextRequest, NextResponse } from 'next/server'
import { saveInstagramConnection, type InstagramConnection } from '@/lib/connections'
import { nonceFromState, stashHandoff } from '@/lib/handoff'
import {
  exchangeInstagramCodeForToken,
  exchangeForLongLivedToken,
  getInstagramAppCredentials,
  getInstagramProfile,
} from '@/lib/instagram'
import { getBaseUrl } from '@/lib/oauth'
import { updateDoc } from '@/lib/drive-db'

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
      new URL(`/settings?ig_error=${encodeURIComponent('Instagram app not configured. Set INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET.')}`, req.url)
    )
  }

  const redirectUri = `${base}/api/auth/instagram/callback`
  const shortToken = await exchangeInstagramCodeForToken({ code, redirectUri, appId, appSecret })
  if (!shortToken.access_token) {
    const msg = shortToken.error?.message ?? shortToken.error_message ?? 'token_exchange_failed'
    return NextResponse.redirect(new URL(`/settings?ig_error=${encodeURIComponent(msg)}`, req.url))
  }

  const longToken = await exchangeForLongLivedToken({ accessToken: shortToken.access_token, appSecret })
  const accessToken = longToken.access_token ?? shortToken.access_token
  const expiresAt = longToken.expires_in ? Date.now() + longToken.expires_in * 1000 : undefined

  const profile = await getInstagramProfile(accessToken)
  const accountId = profile.user_id ?? profile.id ?? String(shortToken.user_id ?? '')
  if (!accountId) {
    return NextResponse.redirect(
      new URL(`/settings?ig_error=${encodeURIComponent(profile.error?.message ?? 'Could not resolve the Instagram account for this login.')}`, req.url)
    )
  }

  // (a) Encrypted cookie — posting/analytics UI (workspace-scoped).
  const conn: InstagramConnection = {
    access_token: accessToken,
    account_id: accountId,
    username: profile.username,
    expires_at: expiresAt,
  }
  await saveInstagramConnection(conn)

  // Desktop hand-off: this ran in Chrome, so also stash the connection for the
  // Content OS app (polling /api/auth/handoff) to adopt into its own session.
  const nonce = nonceFromState(req.nextUrl.searchParams.get('state'))
  let handoffOk = false
  if (nonce) {
    try {
      await stashHandoff(nonce, 'instagram', conn)
      handoffOk = true
    } catch (e) {
      console.error('[handoff] stash failed:', e)
    }
  }

  // (b) DM engine store — webhooks fire with no cookies, so the DM automation
  // reads tokens server-side from the Drive DB (same shape as triggerdm's
  // storedTokens). Best-effort: a Drive hiccup must not break connecting.
  try {
    await updateDoc<Record<string, unknown>>('dm', {}, (db) => {
      const stored = ((db.storedTokens as Record<string, unknown>) ?? {})
      stored[`WORKSPACE_TOKEN:ig-${accountId}`] = {
        token: accessToken,
        meta: {
          igUserId: accountId,
          username: profile.username ?? null,
          accountType: profile.account_type ?? null,
          source: 'instagram_login',
          expiresAt: expiresAt ?? null,
        },
        updatedAt: new Date().toISOString(),
      }
      return { ...db, storedTokens: stored }
    })
  } catch (e) {
    console.error('[instagram] DM token dual-write failed:', e)
  }

  return NextResponse.redirect(new URL(`/settings?ig_connected=1${nonce ? (handoffOk ? '&handoff_done=1' : '&handoff_failed=1') : ''}`, req.url))
}
