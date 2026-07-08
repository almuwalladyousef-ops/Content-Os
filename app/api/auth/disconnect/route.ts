import { NextRequest, NextResponse } from 'next/server'
import { clearGoogleAccount, clearInstagramConnection, clearTikTokConnection, revokeTikTokToken, clearXConnection, revokeXToken } from '@/lib/connections'

export async function POST(req: NextRequest) {
  const { platform } = await req.json()

  switch (platform) {
    case 'youtube':
    case 'google':
      await clearGoogleAccount()
      break
    case 'instagram':
      await clearInstagramConnection()
      break
    case 'tiktok':
      await revokeTikTokToken()
      await clearTikTokConnection()
      break
    case 'x':
      await revokeXToken()
      await clearXConnection()
      break
    default:
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
