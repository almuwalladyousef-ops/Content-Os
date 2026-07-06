import { NextRequest, NextResponse } from 'next/server'
import { takeHandoff, stashHandoff } from '@/lib/handoff'
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
  // Storage self-test (no secrets exposed): round-trips a dummy entry so a
  // broken Drive-DB config shows up here instead of as a silent hand-off fail.
  if (req.nextUrl.searchParams.get('selftest') === '1') {
    const diag: Record<string, unknown> = {
      driveCreds: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
      folderOrFileId: !!(process.env.DRIVE_DB_FOLDER_ID || process.env.DRIVE_DB_HANDOFF_FILE_ID),
    }
    const testNonce = crypto.randomUUID()
    try {
      await stashHandoff(testNonce, 'google', { selftest: true })
      const back = await takeHandoff(testNonce)
      diag.roundtrip = back ? 'ok' : 'stash_read_back_empty'
    } catch (e) {
      diag.roundtrip = `error: ${e instanceof Error ? e.message : String(e)}`
    }
    return NextResponse.json(diag)
  }

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
