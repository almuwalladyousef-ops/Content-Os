import { NextRequest, NextResponse } from 'next/server'
import { getXConnection } from '@/lib/connections'
import { postXVideo } from '@/lib/post-platforms'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const connection = await getXConnection()
  if (!connection) {
    return NextResponse.json({ error: 'X not connected. Connect it in Settings.' }, { status: 400 })
  }

  try {
    const { blobUrl, text, size, type } = await req.json()
    if (!blobUrl) return NextResponse.json({ error: 'No blob URL provided' }, { status: 400 })

    const result = await postXVideo({
      accessToken: connection.accessToken,
      blobUrl,
      text: text || '',
      size,
      type: type || 'video/mp4',
      username: connection.username,
    })
    return NextResponse.json({ postId: result.postId, postUrl: result.postUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
