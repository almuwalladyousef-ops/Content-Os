import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Dashboard online/offline indicator for the Mac-mini home server. Proxies
 * HOME_SERVER_URL/api/health server-side (short timeout) so the browser never
 * needs the home-server URL or secret.
 */
export async function GET() {
  const base = process.env.HOME_SERVER_URL
  if (!base) return NextResponse.json({ online: false, configured: false })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/health`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${process.env.HOME_SERVER_SECRET ?? ''}` },
      cache: 'no-store',
    })
    return NextResponse.json({ online: res.ok, configured: true })
  } catch {
    return NextResponse.json({ online: false, configured: true })
  } finally {
    clearTimeout(timeout)
  }
}
