import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Dashboard online/offline indicator for the Mac-mini home server. Proxies
 * HOME_SERVER_URL/api/health server-side (short timeout) so the browser never
 * needs the home-server URL or secret.
 */
export async function GET() {
  const base = process.env.HOME_SERVER_URL
  const checkedAt = new Date().toISOString()
  if (!base) return NextResponse.json({ online: false, configured: false, checkedAt })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  const startedAt = Date.now()
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/health`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${process.env.HOME_SERVER_SECRET ?? ''}` },
      cache: 'no-store',
    })
    const latencyMs = Date.now() - startedAt
    const body = await res.json().catch(() => null)
    return NextResponse.json({
      online: res.ok,
      configured: true,
      checkedAt,
      latencyMs,
      service: body?.service ?? null,
      serverTime: body?.now ?? null,
      error: res.ok ? null : `home server replied ${res.status}`,
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json({
      online: false,
      configured: true,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      error: aborted ? 'no answer in 4s — Mac mini asleep or off?' : 'unreachable',
    })
  } finally {
    clearTimeout(timeout)
  }
}
