/**
 * Client for the Mac mini home server's large-file storage — replaces
 * Vercel Blob. Files are streamed to/from `HOME_SERVER_URL/storage/file/<key>`
 * with the single shared `HOME_SERVER_SECRET` (see home-server/storage.js).
 *
 * Browser-side direct uploads (multi-GB videos can't pass through a Vercel
 * function) use the same endpoint with `?secret=` — see storageFileUrl().
 */

function baseUrl(): string {
  const url = process.env.HOME_SERVER_URL || process.env.NEXT_PUBLIC_HOME_SERVER_URL
  if (!url) throw new Error('HOME_SERVER_URL is not set')
  return url.replace(/\/+$/, '')
}

function secret(): string {
  return process.env.HOME_SERVER_SECRET || process.env.NEXT_PUBLIC_HOME_SERVER_SECRET || ''
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const s = secret()
  return { ...(s ? { authorization: `Bearer ${s}` } : {}), ...(extra || {}) }
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

/** Server-side URL of a stored file (includes the shared secret). */
export function storageFileUrl(key: string): string {
  const s = secret()
  return `${baseUrl()}/storage/file/${encodeKey(key)}${s ? `?secret=${encodeURIComponent(s)}` : ''}`
}

export async function putFile(
  key: string,
  body: Blob | ArrayBuffer | Uint8Array | ReadableStream,
  contentType = 'application/octet-stream'
): Promise<void> {
  const res = await fetch(`${baseUrl()}/storage/file/${encodeKey(key)}`, {
    method: 'PUT',
    headers: headers({ 'x-content-type': contentType }),
    body: body as BodyInit,
    // @ts-expect-error — required by Node fetch when body is a stream
    duplex: 'half',
  })
  if (!res.ok) throw new Error(`home-storage put ${key} failed: ${res.status} ${await res.text().catch(() => '')}`)
}

/** Streams a stored file (used by the cron worker to post scheduled videos). */
export async function getFile(key: string): Promise<Response> {
  const res = await fetch(storageFileUrl(key), { cache: 'no-store' })
  if (!res.ok) throw new Error(`home-storage get ${key} failed: ${res.status}`)
  return res
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await fetch(`${baseUrl()}/storage/file/${encodeKey(key)}`, { method: 'DELETE', headers: headers() })
  } catch {
    /* best effort */
  }
}

/** True when a home server is configured and answering. */
export async function homeServerOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}
