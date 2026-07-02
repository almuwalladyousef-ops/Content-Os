import {
  instagramGraphUrl,
  resolveInstagramAccountId,
  instagramGraphErrorMessage,
} from './instagram'

/**
 * Platform posting, decoupled from the request/cookie context.
 *
 * Each function takes the access token (and any account id) as a plain argument
 * and either resolves with the post result or throws an Error. This lets the
 * same logic back both the interactive "Post now" routes (which read tokens from
 * cookies) and the scheduled cron worker (which uses a snapshotted token).
 */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface YouTubeResult { videoId: string; videoUrl: string }

export async function postYouTubeVideo(opts: {
  accessToken: string
  blobUrl: string
  title: string
  description: string
  privacy: string
  size: number
  type: string
}): Promise<YouTubeResult> {
  const { accessToken, blobUrl, title, description, privacy, size, type } = opts

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': type || 'video/mp4',
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({
        snippet: { title: title || 'New video', description: description || '' },
        status: { privacyStatus: privacy || 'unlisted' },
      }),
    }
  )
  if (!initRes.ok) throw new Error(`YouTube init failed: ${await initRes.text()}`)

  const sessionUri = initRes.headers.get('Location')
  if (!sessionUri) throw new Error('YouTube returned no upload URI')

  const blobRes = await fetch(blobUrl)
  if (!blobRes.ok || !blobRes.body) throw new Error('Failed to fetch video from blob storage')

  const uploadRes = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes 0-${size - 1}/${size}`,
      'Content-Type': type || 'video/mp4',
    },
    body: blobRes.body,
    duplex: 'half',
  } as RequestInit)
  if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
    throw new Error(`YouTube upload failed: ${await uploadRes.text()}`)
  }

  const data = await uploadRes.json()
  if (!data.id) throw new Error('YouTube returned no video ID')
  return { videoId: data.id, videoUrl: `https://www.youtube.com/watch?v=${data.id}` }
}

export interface InstagramResult { postId: string; postUrl: string }

/**
 * Posts a Reel. Resolves/repairs the Business account id from the token when the
 * saved one can't read media. `onResolvedAccount` lets the caller persist a
 * corrected account id (interactive routes save it back to the cookie).
 */
export async function postInstagramReel(opts: {
  accessToken: string
  accountId: string
  videoUrl: string
  caption: string
  onResolvedAccount?: (accountId: string) => Promise<void> | void
}): Promise<InstagramResult> {
  const { accessToken, videoUrl, caption } = opts

  const resolved = await resolveInstagramAccountId(accessToken, opts.accountId)
  if (resolved.mediaError) {
    throw new Error(instagramGraphErrorMessage(
      'Instagram account is not a usable Business/Creator account. Reconnect Instagram in Settings.',
      resolved.mediaError,
    ))
  }
  const accountId = resolved.accountId
  if (resolved.changed) await opts.onResolvedAccount?.(accountId)

  // 1: create container
  const containerRes = await fetch(instagramGraphUrl(`${accountId}/media`, {}), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption || '',
      access_token: accessToken,
    }),
  })
  const containerData = await containerRes.json()
  if (containerData.error) {
    const e = containerData.error
    throw new Error(`Instagram container error: (#${e.code}/${e.error_subcode}) ${e.message} [type: ${e.type}]`)
  }
  const creationId = containerData.id

  // 2: poll until processed
  let attempts = 0
  while (attempts < 40) {
    await sleep(3000)
    const statusRes = await fetch(instagramGraphUrl(creationId, { fields: 'status_code', access_token: accessToken }))
    const statusData = await statusRes.json()
    if (statusData.status_code === 'FINISHED') break
    if (statusData.status_code === 'ERROR') throw new Error(`Instagram processing failed: ${JSON.stringify(statusData)}`)
    attempts++
  }
  if (attempts >= 40) throw new Error('Instagram processing timed out after 2 minutes')

  // 3: publish
  const publishRes = await fetch(instagramGraphUrl(`${accountId}/media_publish`, {}), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
  })
  const publishData = await publishRes.json()
  if (publishData.error) throw new Error(`Instagram publish error: ${publishData.error.message}`)

  return { postId: publishData.id, postUrl: `https://www.instagram.com/p/${publishData.id}/` }
}

export interface TikTokResult { publishId: string }

export async function postTikTokVideo(opts: {
  accessToken: string
  blobUrl: string
  caption: string
  privacy: string
  size: number
}): Promise<TikTokResult> {
  const { accessToken, blobUrl, caption, privacy, size } = opts
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
  }

  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      post_info: {
        title: caption?.slice(0, 150) || 'New video',
        privacy_level: privacy || 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
    }),
  })
  const initData = await initRes.json()
  if (initData.error?.code !== 'ok' && initData.error?.code !== undefined) {
    throw new Error(`TikTok init error: ${JSON.stringify(initData.error)}`)
  }
  const { upload_url, publish_id } = initData.data

  const blobRes = await fetch(blobUrl)
  if (!blobRes.ok || !blobRes.body) throw new Error('Failed to fetch video from blob storage')

  const uploadRes = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes 0-${size - 1}/${size}`,
      'Content-Length': String(size),
      'Content-Type': 'video/mp4',
    },
    body: blobRes.body,
    duplex: 'half',
  } as RequestInit)
  if (!uploadRes.ok) throw new Error(`TikTok upload failed: ${uploadRes.status}`)

  let attempts = 0
  while (attempts < 30) {
    await sleep(5000)
    const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers,
      body: JSON.stringify({ publish_id }),
    })
    const statusData = await statusRes.json()
    const pubStatus = statusData.data?.status
    if (pubStatus === 'PUBLISH_COMPLETE') return { publishId: publish_id }
    if (pubStatus === 'FAILED') throw new Error(`TikTok publish failed: ${JSON.stringify(statusData)}`)
    attempts++
  }
  throw new Error('TikTok publishing timed out')
}
