import { NextRequest, NextResponse } from 'next/server'
import {
  getGoogleAccountRaw,
  getInstagramConnectionRaw,
  getTikTokConnectionRaw,
} from '@/lib/connections'
import { addJob, loadQueue, toPublicJob, type ScheduledJob, type TokenSnapshot } from '@/lib/schedule-store'

export const maxDuration = 60

/**
 * Enqueue a post to fire later. Captures (snapshots) the credentials for the
 * enabled platforms now, because the cron worker that fires the post has no
 * session. The video is expected to already be uploaded to Blob by the client.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const platforms = {
      youtube: !!body.platforms?.youtube,
      instagram: !!body.platforms?.instagram,
      tiktok: !!body.platforms?.tiktok,
    }
    if (!platforms.youtube && !platforms.instagram && !platforms.tiktok) {
      return NextResponse.json({ error: 'Select at least one platform' }, { status: 400 })
    }
    if (!body.blobUrl) return NextResponse.json({ error: 'No video uploaded' }, { status: 400 })
    const when = new Date(body.scheduledAt)
    if (isNaN(when.getTime())) return NextResponse.json({ error: 'Invalid schedule time' }, { status: 400 })

    // Snapshot only the credentials we need, and verify each enabled platform is connected.
    const tokens: TokenSnapshot = {}
    if (platforms.youtube) {
      const g = await getGoogleAccountRaw()
      if (!g?.refresh_token) return NextResponse.json({ error: 'YouTube/Google not connected (or missing refresh token — reconnect in Settings)' }, { status: 400 })
      tokens.google = { access_token: g.access_token, refresh_token: g.refresh_token, expires_at: g.expires_at, email: g.email }
    }
    if (platforms.instagram) {
      const ig = await getInstagramConnectionRaw()
      if (!ig?.access_token || !ig?.account_id) return NextResponse.json({ error: 'Instagram not connected' }, { status: 400 })
      tokens.instagram = { access_token: ig.access_token, account_id: ig.account_id, username: ig.username }
    }
    if (platforms.tiktok) {
      const tt = await getTikTokConnectionRaw()
      if (!tt?.access_token) return NextResponse.json({ error: 'TikTok not connected' }, { status: 400 })
      tokens.tiktok = { access_token: tt.access_token, refresh_token: tt.refresh_token, expires_at: tt.expires_at }
    }

    const job: ScheduledJob = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      scheduledAt: when.toISOString(),
      status: 'pending',
      videoType: body.videoType === 'long' ? 'long' : 'short',
      platforms,
      blobUrl: String(body.blobUrl),
      fileName: String(body.fileName || 'video.mp4'),
      size: Number(body.size) || 0,
      type: String(body.type || 'video/mp4'),
      caption: String(body.caption || ''),
      ytCaption: String(body.ytCaption || ''),
      hashtags: Array.isArray(body.hashtags) ? body.hashtags.map(String) : [],
      privacy: String(body.privacy || 'public'),
      ttPrivacy: String(body.ttPrivacy || 'SELF_ONLY'),
      tokens,
    }

    await addJob(job)
    return NextResponse.json({ ok: true, jobId: job.id, scheduledAt: job.scheduledAt })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}

/** Lightweight read of the queue (public fields only) — handy for debugging. */
export async function GET() {
  const jobs = await loadQueue()
  return NextResponse.json({ jobs: jobs.map(toPublicJob) })
}
