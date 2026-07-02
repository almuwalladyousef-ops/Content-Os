import { encrypt, decrypt } from './crypto'
import { readDoc, writeDoc } from './drive-db'
import { deleteFile } from './home-storage'

/**
 * Persistent queue of scheduled posts.
 *
 * The cron worker runs with no cookies/session, so the queue lives in the
 * Google Drive JSON-DB (env-credential access only). The whole queue —
 * including the per-job credential snapshot — is AES-encrypted with
 * NEXTAUTH_SECRET before it touches Drive, so the stored doc is opaque
 * without the server secret. Video files themselves live on the Mac mini
 * home server (see lib/home-storage.ts).
 */

const QUEUE_SECTION = 'schedule'

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
  // media — blobUrl is a publicly fetchable URL on the home server
  // (Instagram's Graph API downloads it directly); fileKey is the
  // home-server storage key used for cleanup.
  blobUrl: string
  fileKey?: string
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
    const enc = await readDoc<string>(QUEUE_SECTION)
    if (!enc || typeof enc !== 'string' || !enc.trim()) return []
    return JSON.parse(decrypt(enc)) as ScheduledJob[]
  } catch {
    return []
  }
}

export async function saveQueue(jobs: ScheduledJob[]): Promise<void> {
  await writeDoc(QUEUE_SECTION, encrypt(JSON.stringify(jobs)))
}

export async function addJob(job: ScheduledJob): Promise<void> {
  const jobs = await loadQueue()
  jobs.push(job)
  await saveQueue(jobs)
}

/** Removes the stored video on the home server (called after a successful post). */
export async function deleteJobVideo(job: ScheduledJob): Promise<void> {
  // Older jobs stored only the URL; derive the key from it.
  const key = job.fileKey
    || decodeURIComponent((job.blobUrl.split('/storage/file/')[1] || '').split('?')[0])
  if (!key) return
  try { await deleteFile(key) } catch { /* best effort */ }
}
