import { NextRequest, NextResponse } from 'next/server'
import { getTikTokConnection } from '@/lib/connections'

export async function POST(req: NextRequest) {
  const connection = await getTikTokConnection()
  if (!connection) {
    return NextResponse.json({ error: 'TikTok not connected. Connect it in Settings.' }, { status: 400 })
  }

  try {
    const { caption, privacy, size } = await req.json()

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption?.slice(0, 150) || 'New video',
          privacy_level: privacy || 'SELF_ONLY',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: size,
          chunk_size: size,
          total_chunk_count: 1,
        },
      }),
    })

    const initData = await initRes.json()
    if (initData.error?.code !== 'ok' && initData.error?.code !== undefined) {
      return NextResponse.json({ error: `TikTok init error: ${JSON.stringify(initData.error)}` }, { status: 400 })
    }

    const { upload_url, publish_id } = initData.data
    return NextResponse.json({ uploadUrl: upload_url, publishId: publish_id })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
