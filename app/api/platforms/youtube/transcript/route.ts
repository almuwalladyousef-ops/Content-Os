import { NextRequest, NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'

function parseSrt(srt: string): string {
  return srt
    .split('\n')
    .filter(line => {
      if (/^\d+$/.test(line.trim())) return false
      if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(line)) return false
      return true
    })
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 })

  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No Google account connected' }, { status: 401 })

  const token = account.accessToken
  const yt = 'https://www.googleapis.com/youtube/v3'

  try {
    // List available captions
    const listRes = await fetch(
      `${yt}/captions?part=snippet&videoId=${videoId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const listData = await listRes.json()

    if (listData.error) {
      if (listData.error.status === 'PERMISSION_DENIED') {
        return NextResponse.json({
          error: 'Caption access requires reconnecting your Google account. Go to Settings and reconnect.',
        }, { status: 403 })
      }
      return NextResponse.json({ error: listData.error.message }, { status: 400 })
    }

    const captions: { id: string; snippet: { language: string; trackKind: string } }[] = listData.items ?? []
    if (captions.length === 0) {
      return NextResponse.json({ error: 'No captions available for this video' }, { status: 404 })
    }

    // Prefer English, then any available
    const preferred = captions.find(c => c.snippet.language.startsWith('en')) ?? captions[0]

    const dlRes = await fetch(
      `${yt}/captions/${preferred.id}?tfmt=srt`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!dlRes.ok) {
      return NextResponse.json({
        error: 'Could not download captions. Reconnect your Google account in Settings to grant caption access.',
      }, { status: 403 })
    }

    const srt = await dlRes.text()
    const transcript = parseSrt(srt)

    return NextResponse.json({ transcript, captionLang: preferred.snippet.language })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
