import { NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/oauth'

// Google connect — backs YouTube, Drive, Analytics and Gmail notifications.
export function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(
      new URL(`/settings?yt_error=${encodeURIComponent('Google app not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.')}`, req.url)
    )
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/api/auth/callback`,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
