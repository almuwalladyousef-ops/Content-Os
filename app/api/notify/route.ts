import { NextRequest, NextResponse } from 'next/server'
import { getActiveAccount } from '@/lib/accounts'
import { google } from 'googleapis'

interface PlatformResult {
  success: boolean
  url?: string
  error?: string
}

export async function POST(req: NextRequest) {
  const account = await getActiveAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  const { videoName, results } = await req.json() as {
    videoName: string
    results: Record<string, PlatformResult>
  }

  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: account.accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  const succeeded = Object.entries(results).filter(([, r]) => r.success)
  const failed = Object.entries(results).filter(([, r]) => !r.success)

  const platformLabel: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
  }

  const successLines = succeeded.map(([p, r]) =>
    `  • ${platformLabel[p] ?? p}${r.url ? `: ${r.url}` : ''}`
  ).join('\n')

  const failLines = failed.map(([p, r]) =>
    `  • ${platformLabel[p] ?? p}: ${r.error ?? 'unknown error'}`
  ).join('\n')

  const subject = succeeded.length > 0 && failed.length === 0
    ? `✅ Posted "${videoName}" to ${succeeded.map(([p]) => platformLabel[p] ?? p).join(', ')}`
    : failed.length > 0 && succeeded.length === 0
      ? `❌ Post failed for "${videoName}"`
      : `⚠️ Partial post for "${videoName}"`

  const body = [
    `ContentOS Post Report`,
    ``,
    `Video: ${videoName}`,
    ``,
    succeeded.length > 0 ? `Successfully published to:\n${successLines}` : null,
    failed.length > 0 ? `Failed on:\n${failLines}` : null,
  ].filter(Boolean).join('\n')

  const to = account.email
  if (!to) return NextResponse.json({ error: 'No email on account' }, { status: 400 })

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString('base64url')

  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
