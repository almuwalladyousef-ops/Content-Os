import { NextResponse } from 'next/server'
import { getInstagramConnection, saveInstagramConnection } from '@/lib/connections'
import { instagramGraphErrorMessage, instagramGraphUrl, resolveInstagramAccountId } from '@/lib/instagram'

type InsightMetricMap = Record<string, number>

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

async function fetchInsightMetric(mediaId: string, metric: string, token: string): Promise<InsightMetricMap> {
  const res = await fetch(instagramGraphUrl(`${mediaId}/insights`, {
    metric,
    period: 'lifetime',
    access_token: token,
  }))
  const data = await res.json()
  if (data.error) {
    console.warn(`[IG insights] ${mediaId}/${metric}:`, data.error?.message, data.error?.code)
    return {}
  }

  const metrics: InsightMetricMap = {}
  for (const item of data.data ?? []) {
    const value = toFiniteNumber(item.values?.[0]?.value ?? item.value)
    if (value !== undefined) metrics[item.name ?? metric] = value
  }
  return metrics
}

async function fetchInsightMetrics(mediaId: string, metrics: string[], token: string): Promise<InsightMetricMap> {
  const settled = await Promise.allSettled(metrics.map(metric => fetchInsightMetric(mediaId, metric, token)))
  return settled.reduce<InsightMetricMap>((all, result) => {
    if (result.status === 'fulfilled') Object.assign(all, result.value)
    return all
  }, {})
}

export async function GET() {
  const connection = await getInstagramConnection()
  if (!connection) {
    return NextResponse.json({ error: 'Instagram not connected. Connect it in Settings.' }, { status: 400 })
  }

  const ig_access_token = connection.accessToken
  const resolved = await resolveInstagramAccountId(ig_access_token, connection.accountId)
  if (resolved.mediaError) {
    return NextResponse.json({
      error: instagramGraphErrorMessage('Instagram account is not a usable Business/Creator account. Reconnect Instagram in Settings.', resolved.mediaError),
    }, { status: 400 })
  }
  const ig_account_id = resolved.accountId
  if (resolved.changed) {
    await saveInstagramConnection({ access_token: ig_access_token, account_id: ig_account_id, username: connection.username })
  }

  try {
    const [mediaRes, accountRes] = await Promise.all([
      fetch(instagramGraphUrl(`${ig_account_id}/media`, {
        fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,like_count,comments_count,video_duration,duration',
        limit: '20',
        access_token: ig_access_token,
      })),
      fetch(instagramGraphUrl(ig_account_id, { fields: 'followers_count', access_token: ig_access_token })),
    ])
    const [mediaData, accountData] = await Promise.all([mediaRes.json(), accountRes.json()])
    const followersCount: number | undefined = toFiniteNumber(accountData.followers_count)

    if (mediaData.error) {
      return NextResponse.json({ error: mediaData.error.message }, { status: 400 })
    }

    const videoItems = (mediaData.data ?? []).filter(
      (item: { media_type: string; media_product_type?: string }) =>
        item.media_type === 'VIDEO' || item.media_type === 'REEL' || item.media_product_type === 'REELS'
    )

    const withInsights = await Promise.all(
      videoItems.map(async (item: {
        id: string
        caption?: string
        media_type: string
        media_product_type?: string
        timestamp: string
        permalink?: string
        thumbnail_url?: string
        like_count?: number
        comments_count?: number
        video_duration?: number
        duration?: number
      }) => {
        const [insightMetrics, durationRes] = await Promise.all([
          fetchInsightMetrics(item.id, [
            'reach',
            'saved',
            'shares',
            'views',
            'plays',
            'video_views',
            'impressions',
            'ig_reels_avg_watch_time',
            'ig_reels_video_view_total_time',
          ], ig_access_token),
          (item.video_duration == null && item.duration == null)
            ? fetch(instagramGraphUrl(item.id, { fields: 'video_duration,duration', access_token: ig_access_token }))
            : Promise.resolve(null),
        ])

        let videoDurationSec = toFiniteNumber(item.video_duration) ?? toFiniteNumber(item.duration)
        if (videoDurationSec == null && durationRes) {
          try {
            const d = await durationRes.json()
            videoDurationSec = toFiniteNumber(d.video_duration) ?? toFiniteNumber(d.duration)
          } catch { /* non-fatal */ }
        }

        return {
          id: item.id,
          caption: item.caption ?? '',
          timestamp: item.timestamp,
          permalink: item.permalink,
          thumbnail: item.thumbnail_url,
          metrics: {
            platform: 'instagram' as const,
            mediaType: item.media_product_type ?? item.media_type,
            plays: insightMetrics['views']
              ?? insightMetrics['plays']
              ?? insightMetrics['video_views']
              ?? (insightMetrics['ig_reels_video_view_total_time'] !== undefined && insightMetrics['ig_reels_avg_watch_time']
                ? Math.round(insightMetrics['ig_reels_video_view_total_time'] / insightMetrics['ig_reels_avg_watch_time'])
                : undefined)
              ?? insightMetrics['impressions'],
            reach: insightMetrics['reach'],
            saves: insightMetrics['saved'],
            shares: insightMetrics['shares'],
            avgWatchTimeMs: insightMetrics['ig_reels_avg_watch_time'],
            likes: item.like_count,
            comments: item.comments_count,
            videoDurationSec,
            followers: followersCount,
          },
        }
      })
    )

    return NextResponse.json({ posts: withInsights })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
