import { NextRequest, NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId')

  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  const token = account.accessToken

  // Check which scopes the token actually has
  const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`)
  const tokenInfo = await tokenInfoRes.json()

  if (!videoId) {
    return NextResponse.json({ tokenInfo, note: 'Pass ?videoId=<id> to also test retention API' })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Try Analytics API with just audienceWatchRatio (no relativeRetentionPerformance)
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', 'channel==MINE')
  url.searchParams.set('startDate', '2020-01-01')
  url.searchParams.set('endDate', today)
  url.searchParams.set('metrics', 'audienceWatchRatio')
  url.searchParams.set('dimensions', 'elapsedVideoTimeRatio')
  url.searchParams.set('filters', `video==${videoId}`)

  const analyticsRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const analytics = await analyticsRes.json()

  // Also try basic analytics (views) as a simpler scope test
  const basicUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  basicUrl.searchParams.set('ids', 'channel==MINE')
  basicUrl.searchParams.set('startDate', '2024-01-01')
  basicUrl.searchParams.set('endDate', today)
  basicUrl.searchParams.set('metrics', 'views')
  basicUrl.searchParams.set('dimensions', 'video')
  basicUrl.searchParams.set('filters', `video==${videoId}`)

  const basicRes = await fetch(basicUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  const basic = await basicRes.json()

  return NextResponse.json({ tokenInfo, retentionQuery: analytics, basicViewsQuery: basic })
}
