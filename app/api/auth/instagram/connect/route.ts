import { NextRequest, NextResponse } from 'next/server'
import { getInstagramAppCredentials } from '@/lib/instagram'
import { getBaseUrl } from '@/lib/oauth'

export async function GET(req: NextRequest) {
  const { appId } = getInstagramAppCredentials()
  if (!appId) {
    return NextResponse.redirect(
      new URL(`/settings?ig_error=${encodeURIComponent('Instagram app not configured. Set FACEBOOK_APP_ID / FACEBOOK_APP_SECRET.')}`, req.url)
    )
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/instagram/callback`
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'pages_show_list',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_manage_insights',
      'instagram_content_publish',
    ].join(','),
  })

  return NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params}`)
}
