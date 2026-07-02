import { NextRequest, NextResponse } from 'next/server'
import { getInstagramConnection, saveInstagramConnection } from '@/lib/connections'
import { postInstagramReel } from '@/lib/post-platforms'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const connection = await getInstagramConnection()
  if (!connection) {
    return NextResponse.json({ error: 'Instagram not connected. Connect it in Settings.' }, { status: 400 })
  }

  try {
    const { videoUrl, caption } = await req.json()
    if (!videoUrl) return NextResponse.json({ error: 'No video URL provided' }, { status: 400 })

    const result = await postInstagramReel({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      videoUrl,
      caption: caption || '',
      onResolvedAccount: (accountId) =>
        saveInstagramConnection({ access_token: connection.accessToken, account_id: accountId, username: connection.username }),
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
