import { NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'

function isoDurationToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseInt(m[3] ?? '0')
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export async function GET() {
  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No Google account connected' }, { status: 401 })

  const token = account.accessToken
  const yt = 'https://www.googleapis.com/youtube/v3'

  try {
    // Get uploads playlist ID
    const channelRes = await fetch(
      `${yt}/channels?part=contentDetails&mine=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const channelData = await channelRes.json()
    if (channelData.error) return NextResponse.json({ error: channelData.error.message }, { status: 400 })

    const uploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsId) return NextResponse.json({ error: 'No uploads playlist found' }, { status: 404 })

    // List recent uploads
    const listRes = await fetch(
      `${yt}/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const listData = await listRes.json()
    if (listData.error) return NextResponse.json({ error: listData.error.message }, { status: 400 })

    const items = listData.items ?? []
    const videoIds = items.map((i: { snippet: { resourceId: { videoId: string } } }) => i.snippet.resourceId.videoId).join(',')

    if (!videoIds) return NextResponse.json({ posts: [] })

    // Get stats + duration
    const statsRes = await fetch(
      `${yt}/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const statsData = await statsRes.json()
    if (statsData.error) return NextResponse.json({ error: statsData.error.message }, { status: 400 })

    const posts = (statsData.items ?? []).map((v: {
      id: string
      snippet: { title: string; publishedAt: string; thumbnails: { medium?: { url: string }; default?: { url: string } } }
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string }
      contentDetails: { duration: string }
    }) => ({
      id: v.id,
      title: v.snippet.title,
      timestamp: v.snippet.publishedAt,
      thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url,
      permalink: `https://www.youtube.com/watch?v=${v.id}`,
      duration: formatDuration(isoDurationToSeconds(v.contentDetails.duration)),
      metrics: {
        platform: 'youtube' as const,
        views: parseInt(v.statistics.viewCount ?? '0'),
        likes: parseInt(v.statistics.likeCount ?? '0'),
        comments: parseInt(v.statistics.commentCount ?? '0'),
        videoDurationSec: isoDurationToSeconds(v.contentDetails.duration),
      },
    }))

    return NextResponse.json({ posts })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
