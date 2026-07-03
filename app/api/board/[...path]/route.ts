import { NextRequest, NextResponse } from 'next/server'
import { homeBase, homeHeaders, homeUnavailable } from '@/lib/home-proxy'

/**
 * Proxy for the home server's vault API, used by the native /board page:
 *   GET    /api/board/scan    →  GET    <mini>/api/scan
 *   GET    /api/board/vault   →  GET    <mini>/api/vault
 *   PUT    /api/board/write   →  PUT    <mini>/api/write
 *   POST   /api/board/create  →  POST   <mini>/api/create
 *   DELETE /api/board/delete  →  DELETE <mini>/api/delete
 */

export const dynamic = 'force-dynamic'

async function forward(req: NextRequest, params: Promise<{ path: string[] }>) {
  const base = homeBase()
  if (!base) return homeUnavailable()
  const { path } = await params
  const url = `${base}/api/${path.join('/')}`
  const init: RequestInit = {
    method: req.method,
    headers: homeHeaders({ 'content-type': 'application/json' }),
    cache: 'no-store',
  }
  if (req.method !== 'GET') init.body = await req.text()
  try {
    const upstream = await fetch(url, init)
    const body = await upstream.text()
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'Home server unreachable' }, { status: 502 })
  }
}

type Ctx = { params: Promise<{ path: string[] }> }
export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params)
export const PUT = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params)
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params)
export const DELETE = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params)
