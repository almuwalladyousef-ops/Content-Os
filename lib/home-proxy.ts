import { NextResponse } from 'next/server'

/** Base URL of the Mac-mini home server (no trailing slash), or null if unset. */
export function homeBase(): string | null {
  const base = process.env.HOME_SERVER_URL?.trim()
  return base ? base.replace(/\/+$/, '') : null
}

export function homeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${process.env.HOME_SERVER_SECRET ?? ''}`, ...extra }
}

export const homeUnavailable = () =>
  NextResponse.json({ error: 'Home server not configured — set HOME_SERVER_URL.' }, { status: 503 })

/**
 * Streams a home-server file response back to the browser, forwarding Range so
 * <video>/<audio> seeking works and passing through the relevant headers.
 */
export async function proxyStream(url: string, range: string | null): Promise<Response> {
  const upstream = await fetch(url, { headers: homeHeaders(range ? { range } : {}), cache: 'no-store' })
  const headers = new Headers()
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
