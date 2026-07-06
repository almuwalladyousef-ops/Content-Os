import { NextRequest, NextResponse } from 'next/server'
import { takeHandoff } from '@/lib/handoff'
import {
  saveGoogleAccount,
  saveInstagramConnection,
  saveTikTokConnection,
  type GoogleAccount,
  type InstagramConnection,
  type TikTokConnection,
} from '@/lib/connections'

/**
 * Adopts a desktop OAuth hand-off into THIS browser session.
 *
 * The Content OS app's settings page polls this after sending the user to
 * Chrome to authorize. When the Chrome-side callback has stashed the
 * connection (keyed by the one-time nonce), this route writes it into the
 * caller's encrypted cookies — connecting the app itself — and reports which
 * platform was adopted. The stash entry is single-use and already deleted by
 * the read.
 */
export async function GET(req: NextRequest) {
  const nonce = req.nextUrl.searchParams.get('nonce') ?? ''
  const payload = await takeHandoff(nonce)
  if (!payload) return NextResponse.json({ pending: true })

  try {
    if (payload.platform === 'google') {
      await saveGoogleAccount(payload.data as GoogleAccount)
    } else if (payload.platform === 'instagram') {
      await saveInstagramConnection(payload.data as InstagramConnection)
    } else if (payload.platform === 'tiktok') {
      await saveTikTokConnection(payload.data as TikTokConnection)
    } else {
      return NextResponse.json({ pending: true })
    }
  } catch {
    return NextResponse.json({ error: 'adopt_failed' }, { status: 500 })
  }

  return NextResponse.json({ adopted: payload.platform })
}
