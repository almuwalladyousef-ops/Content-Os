'use client'

/**
 * Browser-side video upload — straight to the Mac mini home server.
 *
 * Vercel functions cap request bodies at ~4.5MB, so multi-GB videos must go
 * browser → home server directly (this is what Vercel Blob client uploads did
 * before; the home server replaces Blob). The server address + shared secret
 * come from /api/media/config so nothing needs NEXT_PUBLIC_* at build time.
 */

export interface MediaUploadResult {
  key: string
  url: string // publicly fetchable (Instagram's servers download from it)
}

let configPromise: Promise<{ url: string; secret: string }> | null = null

async function getConfig(): Promise<{ url: string; secret: string }> {
  if (!configPromise) {
    configPromise = fetch('/api/media/config')
      .then(r => r.json())
      .then(c => {
        if (!c?.url) throw new Error('Home server not configured (HOME_SERVER_URL)')
        return { url: String(c.url).replace(/\/+$/, ''), secret: String(c.secret || '') }
      })
      .catch(e => { configPromise = null; throw e })
  }
  return configPromise
}

/** Uploads with progress (XHR — fetch has no upload progress events). */
export async function uploadMedia(
  file: File,
  onProgress?: (pct: number) => void
): Promise<MediaUploadResult> {
  const { url, secret } = await getConfig()
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const qs = secret ? `?secret=${encodeURIComponent(secret)}` : ''

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${url}/storage/file/${encodedKey}${qs}`)
    xhr.setRequestHeader('x-content-type', file.type || 'video/mp4')
    if (secret) xhr.setRequestHeader('authorization', `Bearer ${secret}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`))
    xhr.onerror = () => reject(new Error('Upload failed: is the home server online?'))
    xhr.send(file)
  })

  return { key, url: `${url}/storage/file/${encodedKey}${qs}` }
}

/** Best-effort cleanup after an immediate (non-scheduled) post. */
export function deleteMedia(key: string): void {
  fetch('/api/media/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).catch(() => {})
}
