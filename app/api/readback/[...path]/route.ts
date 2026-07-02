import { NextRequest } from 'next/server'
import { homeBase, homeHeaders, homeUnavailable } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Catch-all proxy: /api/readback/* → HOME_SERVER_URL/readback-api/* with the
// shared bearer attached (Next rewrites can't add headers). Streams responses
// (Range-aware) so cached narration MP3s play and seek.
async function proxy(req: NextRequest, path: string[]) {
  const base = homeBase()
  if (!base) return homeUnavailable()

  const target = `${base}/readback-api/${path.join('/')}${req.nextUrl.search || ''}`
  const headers = homeHeaders()
  const range = req.headers.get('range')
  if (range) headers['range'] = range

  const init: RequestInit = { method: req.method, headers, cache: 'no-store' }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const ct = req.headers.get('content-type')
    if (ct) headers['content-type'] = ct
    init.body = await req.text()
  }

  const upstream = await fetch(target, init)
  const resHeaders = new Headers()
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
    const v = upstream.headers.get(h)
    if (v) resHeaders.set(h, v)
  }
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders })
}

type Ctx = { params: Promise<{ path: string[] }> }
export async function GET(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path ?? []) }
export async function POST(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path ?? []) }
export async function PATCH(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path ?? []) }
export async function DELETE(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path ?? []) }
