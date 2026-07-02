import { NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/oauth'
import { revokeTikTokToken } from '@/lib/connections'

export async function GET(req: NextRequest) {
  if (!process.env.TIKTOK_CLIENT_KEY) {
    return NextResponse.redirect(
      new URL(`/settings?tt_error=${encodeURIComponent('TikTok app not configured. Set TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET.')}`, req.url)
    )
  }

  // Revoke any existing authorization so TikTok re-prompts for the account
  // (otherwise "Switch account" / reconnect silently re-picks the same one).
  await revokeTikTokToken()

  const redirectUri = `${getBaseUrl(req)}/api/auth/tiktok/callback`
  // Only request scopes your TikTok app has actually been granted, otherwise
  // TikTok rejects the login with a "scope" error. The default is the minimal
  // set needed to post. Add "video.list" (for analytics) via TIKTOK_SCOPES only
  // once your app is approved for it.
  const scope = process.env.TIKTOK_SCOPES?.trim() || 'user.info.basic,video.publish,video.upload'
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope,
    response_type: 'code',
    redirect_uri: redirectUri,
    // Show the login/account screen on reconnect. The revoke above is what
    // actually lets you switch accounts (TikTok otherwise re-approves silently).
    force_login: 'true',
  })

  return NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`)
}
