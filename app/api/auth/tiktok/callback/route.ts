import { NextRequest, NextResponse } from 'next/server'
import { saveTikTokConnection } from '@/lib/connections'
import { getBaseUrl } from '@/lib/oauth'

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req)
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL(`/settings?tt_error=${encodeURIComponent(error ?? 'no_code')}`, req.url))
  }

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${base}/api/auth/tiktok/callback`,
    }),
  })

  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token ?? tokenData.data?.access_token
  const refreshToken = tokenData.refresh_token ?? tokenData.data?.refresh_token
  const expiresIn = tokenData.expires_in ?? tokenData.data?.expires_in ?? 86400

  if (!accessToken) {
    const errMsg = encodeURIComponent(tokenData.error_description ?? tokenData.error ?? JSON.stringify(tokenData))
    return NextResponse.redirect(`${base}/settings?tt_error=${errMsg}`)
  }

  let display_name = ''
  try {
    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userData = await userRes.json()
    display_name = userData.data?.user?.display_name ?? ''
  } catch { /* non-fatal */ }

  await saveTikTokConnection({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    display_name,
  })

  return NextResponse.redirect(new URL('/settings?tt_connected=1', req.url))
}
