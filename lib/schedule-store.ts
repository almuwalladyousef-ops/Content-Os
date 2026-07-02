import { put, list, del } from '@vercel/blob'
import { encrypt, decrypt } from './crypto'

/**
 * Persistent queue of scheduled posts.
 *
 * Why Blob: the cron worker runs with no cookies/session, so it needs a store it
 * can reach using only an env credential (BLOB_READ_WRITE_TOKEN, auto-injected
 * on Vercel). The whole queue — including the per-job credential snapshot — is
 * AES-encrypted with NEXTAUTH_SECRET before it touches Blob, so the (public-URL)
 * blob is opaque without the server secret.
 */

const QUEUE_PATH = 'schedule/queue.json.enc'

export type Platform = 'youtube' | 'instagram' | 'tiktok'

export interface TokenSnapshot {
  google?: { access_token: string; refresh_token: string; expires_at: number; email: string }
  instagram?: { access_token: string; account_id: string; username?: string }
  tiktok?: { access_token: string; refresh_token?: string; expires_at?: number }
}

export interface PlatformOutcome {
  success: boolean
  url?: string
  error?: string
}

export interface ScheduledJob {
  id: string
  createdAt: string
  scheduledAt: string // ISO timestamp — when to fire
  status: 'pending' | 'posting' | 'done' | 'failed'
  videoType: 'short' | 'long'
  platforms: Record<Platform, boolean>
  // media
  blobUrl: string
  fileName: string
  size: number
  type: string
  // content
  caption: string
  ytCaption: string
  hashtags: string[]
  privacy: string   // YouTube
  ttPrivacy: string // TikTok
  // credential snapshot (so the cron worker can post without a session)
  tokens: TokenSnapshot
  // results
  results?: Partial<Record<Platform, PlatformOutcome>>
  postedAt?: string
  error?: string
}

/** Public (non-sensitive) view of a job — safe to hand to the local board sync. */
export type PublicJob = Omit<ScheduledJob, 'tokens' | 'blobUrl'>

export function toPublicJob(job: ScheduledJob): PublicJob {
  const { tokens: _tokens, blobUrl: _blobUrl, ...rest } = job
  void _tokens; void _blobUrl
  return rest
}

export async function loadQueue(): Promise<ScheduledJob[]> {
  try {
    const { blobs } = await list({ prefix: QUEUE_PATH })
    const found = blobs.find(b => b.pathname === QUEUE_PATH)
    if (!found) return []
    // Cache-bust: Blob URLs are CDN-cached, but we always want the latest queue.
    const res = await fetch(`${found.url}?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return []
    const enc = await res.text()
    if (!enc.trim()) return []
    return JSON.parse(decrypt(enc)) as ScheduledJob[]
  } catch {
    return []
  }
}

export async function saveQueue(jobs: ScheduledJob[]): Promise<void> {
  await put(QUEUE_PATH, encrypt(JSON.stringify(jobs)), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'text/plain',
    cacheControlMaxAge: 0,
  })
}

export async function addJob(job: ScheduledJob): Promise<void> {
  const jobs = await loadQueue()
  jobs.push(job)
  await saveQueue(jobs)
}

/** Removes the stored video blob for a job (called after a successful post). */
export async function deleteJobVideo(job: ScheduledJob): Promise<void> {
  try { await del(job.blobUrl) } catch { /* best effort */ }
}
