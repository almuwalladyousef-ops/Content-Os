import { NextRequest, NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'
import { postYouTubeVideo } from '@/lib/post-platforms'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  try {
    const { blobUrl, title, description, privacy, size, type } = await req.json()
    if (!blobUrl) return NextResponse.json({ error: 'No blob URL provided' }, { status: 400 })

    const result = await postYouTubeVideo({
      accessToken: account.accessToken,
      blobUrl,
      title: title || '',
      description: description || '',
      privacy: privacy || 'unlisted',
      size,
      type: type || 'video/mp4',
    })
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
