import { NextRequest, NextResponse } from 'next/server'
import {
  loadQueue, saveQueue, deleteJobVideo, toPublicJob,
  type ScheduledJob, type Platform, type PlatformOutcome,
} from '@/lib/schedule-store'
import { refreshGoogleAccessToken, refreshTikTokAccessToken } from '@/lib/connections'
import { postYouTubeVideo, postInstagramReel, postTikTokVideo } from '@/lib/post-platforms'
import { addHistoryEntry } from '@/lib/history'

// Posting a video can take a while (resumable upload + processing polls).
export const maxDuration = 300

const DONE_TTL_MS = 24 * 60 * 60 * 1000 // keep finished jobs for a day so the board can reconcile

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // If no secret is configured on the server, run unguarded so scheduling works
  // out of the box. The worker only fires posts that are already DUE and never
  // returns credentials, so the exposure is minor. Set CRON_SECRET in Vercel to
  // lock it down — once set, a matching Bearer token (or ?secret=) is required.
  if (!secret) return true
  const header = req.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const query = new URL(req.url).searchParams.get('secret') || ''
  return bearer === secret || query === secret
}

async function runDuePosts(): Promise<{ due: number; jobs: ScheduledJob[] }> {
  let jobs = await loadQueue()
  const nowMs = Date.now()
  const nowSec = Math.floor(nowMs / 1000)

  const due = jobs.filter(j => j.status === 'pending' && new Date(j.scheduledAt).getTime() <= nowMs)
  if (due.length === 0) {
    // Still prune old finished jobs and persist if anything changed.
    const pruned = jobs.filter(j => !((j.status === 'done' || j.status === 'failed') && j.postedAt && nowMs - new Date(j.postedAt).getTime() > DONE_TTL_MS))
    if (pruned.length !== jobs.length) await saveQueue(pruned)
    return { due: 0, jobs: pruned }
  }

  // Claim the due jobs up front so an overlapping tick can't double-fire them.
  for (const j of due) j.status = 'posting'
  await saveQueue(jobs)

  for (const job of due) {
    const results: Partial<Record<Platform, PlatformOutcome>> = {}

    // YouTube
    if (job.platforms.youtube && job.tokens.google) {
      try {
        let access = job.tokens.google.access_token
        if (job.tokens.google.expires_at - nowSec < 300) {
          access = (await refreshGoogleAccessToken(job.tokens.google.refresh_token)).access_token
        }
        const r = await postYouTubeVideo({
          accessToken: access, blobUrl: job.blobUrl,
          title: job.ytCaption || job.fileName.replace(/\.[^.]+$/, ''),
          description: job.ytCaption, privacy: job.privacy, size: job.size, type: job.type,
        })
        results.youtube = { success: true, url: r.videoUrl }
      } catch (e) {
        results.youtube = { success: false, error: String(e instanceof Error ? e.message : e) }
      }
    }

    // Instagram
    if (job.platforms.instagram && job.tokens.instagram) {
      try {
        const captionWithTags = job.caption + (job.hashtags.length ? '\n\n' + job.hashtags.join(' ') : '')
        const r = await postInstagramReel({
          accessToken: job.tokens.instagram.access_token,
          accountId: job.tokens.instagram.account_id,
          videoUrl: job.blobUrl, caption: captionWithTags,
        })
        results.instagram = { success: true, url: r.postUrl }
      } catch (e) {
        results.instagram = { success: false, error: String(e instanceof Error ? e.message : e) }
      }
    }

    // TikTok
    if (job.platforms.tiktok && job.tokens.tiktok) {
      try {
        let access = job.tokens.tiktok.access_token
        const exp = job.tokens.tiktok.expires_at ?? 0
        if (exp > 0 && nowMs > exp - 60_000 && job.tokens.tiktok.refresh_token) {
          const refreshed = await refreshTikTokAccessToken(job.tokens.tiktok.refresh_token)
          if (refreshed?.access_token) access = refreshed.access_token
        }
        const captionWithTags = job.caption + (job.hashtags.length ? '\n\n' + job.hashtags.join(' ') : '')
        await postTikTokVideo({
          accessToken: access, blobUrl: job.blobUrl, caption: captionWithTags,
          privacy: job.ttPrivacy, size: job.size,
        })
        results.tiktok = { success: true }
      } catch (e) {
        results.tiktok = { success: false, error: String(e instanceof Error ? e.message : e) }
      }
    }

    const outcomes = Object.values(results)
    const anySuccess = outcomes.some(o => o?.success)
    job.results = results
    job.postedAt = new Date().toISOString()
    job.status = anySuccess ? 'done' : 'failed'
    if (!anySuccess) job.error = outcomes.map(o => o?.error).filter(Boolean).join(' · ') || 'All platforms failed'

    if (anySuccess) {
      await deleteJobVideo(job)
      // Best-effort history entry (mirrors the interactive flow).
      if (job.tokens.google?.refresh_token) {
        try {
          const access = job.tokens.google.expires_at - nowSec < 300
            ? (await refreshGoogleAccessToken(job.tokens.google.refresh_token)).access_token
            : job.tokens.google.access_token
          const platforms = (Object.keys(results) as Platform[]).filter(p => results[p]?.success)
          await addHistoryEntry(access, {
            id: job.id, date: job.postedAt, video_name: job.fileName, platforms,
            caption: job.caption,
            youtube_url: results.youtube?.url, instagram_url: results.instagram?.url,
          })
        } catch { /* non-fatal */ }
      }
    }

    // Persist after each job so progress survives a timeout on a later job.
    await saveQueue(jobs)
  }

  jobs = (await loadQueue()).filter(j => !((j.status === 'done' || j.status === 'failed') && j.postedAt && Date.now() - new Date(j.postedAt).getTime() > DONE_TTL_MS))
  await saveQueue(jobs)
  return { due: due.length, jobs }
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { due, jobs } = await runDuePosts()
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), due, jobs: jobs.map(toPublicJob) })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
