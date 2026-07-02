import { NextRequest, NextResponse } from 'next/server'
import { getTikTokConnection } from '@/lib/connections'
import { postTikTokVideo } from '@/lib/post-platforms'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const connection = await getTikTokConnection()
  if (!connection) {
    return NextResponse.json({ error: 'TikTok not connected. Connect it in Settings.' }, { status: 400 })
  }

  try {
    const { blobUrl, caption, privacy, size } = await req.json()
    if (!blobUrl) return NextResponse.json({ error: 'No blob URL provided' }, { status: 400 })

    const result = await postTikTokVideo({
      accessToken: connection.accessToken,
      blobUrl,
      caption: caption || '',
      privacy: privacy || 'SELF_ONLY',
      size,
    })
    return NextResponse.json({ publishId: result.publishId })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
