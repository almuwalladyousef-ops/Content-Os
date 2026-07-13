import { NextResponse } from 'next/server'

type JsonObject = Record<string, unknown>

type ProxyJsonOptions = {
  /** Human-readable infinitive used in errors, e.g. "start the transcription". */
  action: string
  timeoutMs?: number
}

/** Base URL of the Mac-mini home server (no trailing slash), or null if unset. */
export function homeBase(): string | null {
  const base = process.env.HOME_SERVER_URL?.trim()
  if (!base) return null
  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function homeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${process.env.HOME_SERVER_SECRET ?? ''}`, ...extra }
}

export const homeUnavailable = () => {
  const configured = process.env.HOME_SERVER_URL?.trim()
  return NextResponse.json(
    configured
      ? { error: 'HOME_SERVER_URL is invalid. Use the full http:// or https:// home-server URL.', code: 'HOME_SERVER_INVALID_URL' }
      : { error: 'Home server not configured — set HOME_SERVER_URL.', code: 'HOME_SERVER_NOT_CONFIGURED' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  )
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHtmlResponse(body: string, contentType: string): boolean {
  return contentType.includes('text/html') || /^\s*(?:<!doctype\s+html|<html\b)/i.test(body)
}

function plainTextError(body: string): string | null {
  const message = body.replace(/\s+/g, ' ').trim()
  if (!message || message.length > 240 || /[<>]/.test(message)) return null
  return message
}

function jsonError(error: string, code: string, status: number, upstreamStatus?: number) {
  return NextResponse.json(
    { error, code, ...(upstreamStatus ? { upstreamStatus } : {}) },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}

/**
 * Proxies a JSON endpoint on the home server without ever forwarding an HTML
 * error page as application/json. This is especially important when the mini
 * is running an older build: Express's default missing-route response is HTML.
 */
export async function proxyHomeJson(
  url: string,
  init: RequestInit,
  { action, timeoutMs = 10_000 }: ProxyJsonOptions,
): Promise<NextResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let upstream: Response
  try {
    upstream = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    clearTimeout(timeout)
    return jsonError(
      timedOut
        ? `The home server timed out while trying to ${action}. Check that the Mac mini is online.`
        : `Could not reach the home server to ${action}. Check the Mac mini and Tailscale Funnel.`,
      timedOut ? 'HOME_SERVER_TIMEOUT' : 'HOME_SERVER_UNREACHABLE',
      timedOut ? 504 : 502,
    )
  }

  let body: string
  try {
    body = await upstream.text()
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return jsonError(
      timedOut
        ? `The home server timed out while trying to ${action}. Check that the Mac mini is online.`
        : `The home server response ended unexpectedly while trying to ${action}.`,
      timedOut ? 'HOME_SERVER_TIMEOUT' : 'HOME_SERVER_INVALID_RESPONSE',
      timedOut ? 504 : 502,
      upstream.status,
    )
  } finally {
    clearTimeout(timeout)
  }

  let payload: unknown
  try {
    payload = body ? JSON.parse(body) : null
  } catch {
    const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? ''
    const html = isHtmlResponse(body, contentType)
    if (upstream.status === 404 && html) {
      return jsonError(
        'LinkScribe is not installed on the running home server. Update and restart the Mac mini home server.',
        'LINKSCRIBE_ROUTE_NOT_FOUND',
        502,
        upstream.status,
      )
    }
    if ((upstream.status === 401 || upstream.status === 403) && html) {
      return jsonError(
        'The home server rejected LinkScribe. Make sure HOME_SERVER_SECRET matches on Vercel and the Mac mini.',
        'HOME_SERVER_AUTH_FAILED',
        502,
        upstream.status,
      )
    }

    const detail = plainTextError(body)
    if (!upstream.ok) {
      return jsonError(
        detail || `The home server returned HTTP ${upstream.status} while trying to ${action}.`,
        'HOME_SERVER_UPSTREAM_ERROR',
        502,
        upstream.status,
      )
    }
    return jsonError(
      html
        ? `The home server returned a web page instead of LinkScribe data while trying to ${action}. Verify HOME_SERVER_URL points to the Content OS home server.`
        : detail || `The home server returned an invalid response while trying to ${action}.`,
      'HOME_SERVER_INVALID_RESPONSE',
      502,
      upstream.status,
    )
  }

  if (!upstream.ok) {
    const error = isJsonObject(payload) && typeof payload.error === 'string'
      ? payload.error
      : `The home server could not ${action} (HTTP ${upstream.status}).`
    const response = isJsonObject(payload)
      ? {
          ...payload,
          error,
          code: typeof payload.code === 'string' ? payload.code : 'HOME_SERVER_UPSTREAM_ERROR',
          upstreamStatus: upstream.status,
        }
      : { error, code: 'HOME_SERVER_UPSTREAM_ERROR', upstreamStatus: upstream.status }
    return NextResponse.json(response, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store' },
    })
  }

  if (!isJsonObject(payload)) {
    return jsonError(
      `The home server returned incomplete LinkScribe data while trying to ${action}.`,
      'HOME_SERVER_INVALID_RESPONSE',
      502,
      upstream.status,
    )
  }

  return NextResponse.json(payload, {
    status: upstream.status,
    headers: { 'cache-control': 'no-store' },
  })
}

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
