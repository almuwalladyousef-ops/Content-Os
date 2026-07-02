import { NextRequest, NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'

export async function POST(req: NextRequest) {
  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  try {
    const { title, description, privacy, size, type } = await req.json()

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
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

    if (!initRes.ok) {
      const err = await initRes.text()
      return NextResponse.json({ error: `YouTube init failed: ${err}` }, { status: initRes.status })
    }

    const sessionUri = initRes.headers.get('Location')
    if (!sessionUri) return NextResponse.json({ error: 'No upload URI returned' }, { status: 500 })

    return NextResponse.json({ sessionUri })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
