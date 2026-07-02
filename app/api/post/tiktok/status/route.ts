import { NextRequest, NextResponse } from 'next/server'
import { getTikTokConnection } from '@/lib/connections'

export async function POST(req: NextRequest) {
  const connection = await getTikTokConnection()
  if (!connection) {
    return NextResponse.json({ error: 'TikTok not connected. Connect it in Settings.' }, { status: 400 })
  }

  try {
    const { publishId } = await req.json()
    const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    })

    const data = await statusRes.json()
    return NextResponse.json({ status: data.data?.status, raw: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
