import { NextRequest, NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 })

  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No Google account connected' }, { status: 401 })

  const token = account.accessToken

  try {
    // Fetch audience retention curve from YouTube Analytics API
    const today = new Date().toISOString().slice(0, 10)
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
    url.searchParams.set('ids', 'channel==MINE')
    url.searchParams.set('startDate', '2020-01-01')
    url.searchParams.set('endDate', today)
    url.searchParams.set('metrics', 'audienceWatchRatio,relativeRetentionPerformance')
    url.searchParams.set('dimensions', 'elapsedVideoTimeRatio')
    url.searchParams.set('filters', `video==${videoId}`)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()

    if (data.error) {
      if (data.error.status === 'PERMISSION_DENIED' || data.error.code === 403) {
        return NextResponse.json({
          error: 'YouTube Analytics access denied. Reconnect your Google account in Settings to grant analytics permission.',
        }, { status: 403 })
      }
      return NextResponse.json({ error: data.error.message ?? JSON.stringify(data.error) }, { status: 400 })
    }

    // rows: [[elapsedRatio, audienceWatchRatio, relativeRetentionPerf], ...]
    const rows: [number, number, number][] = data.rows ?? []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No retention data available for this video yet' }, { status: 404 })
    }

    // Convert audienceWatchRatio (0–1) to percentage points (0–100)
    const curve = rows.map(([, watchRatio]) => Math.round(watchRatio * 100))

    // Average completion = area under curve / number of points
    const avgPct = Math.round(curve.reduce((s, v) => s + v, 0) / curve.length)

    return NextResponse.json({ curve, avgPct, points: rows.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
