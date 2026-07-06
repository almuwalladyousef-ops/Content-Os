import { NextRequest, NextResponse } from 'next/server'
import { getInstagramAppCredentials, instagramAuthorizeUrl } from '@/lib/instagram'
import { getBaseUrl } from '@/lib/oauth'

/**
 * ONE Instagram connect for all account types (Instagram Login, business
 * scopes: posting + comments + messages). Any professional account the user
 * logs in with is accepted — nothing is hardcoded.
 */
export async function GET(req: NextRequest) {
  const { appId } = getInstagramAppCredentials()
  if (!appId) {
    return NextResponse.redirect(
      new URL(`/settings?ig_error=${encodeURIComponent('Instagram app not configured. Set INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET.')}`, req.url)
    )
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/instagram/callback`
  // Desktop hand-off nonce (see lib/handoff.ts) — echoed back on the callback.
  const handoff = req.nextUrl.searchParams.get('handoff') ?? ''
  return NextResponse.redirect(instagramAuthorizeUrl({ appId, redirectUri, state: handoff ? `ho_${handoff}` : undefined }))
}
