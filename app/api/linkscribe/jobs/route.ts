import { NextRequest, NextResponse } from 'next/server'
import { homeBase, homeHeaders, homeUnavailable } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Create a transcription job on the mini. Returns { jobId, status, ... }.
export async function POST(req: NextRequest) {
  const base = homeBase()
  if (!base) return homeUnavailable()
  const body = await req.text()
  const res = await fetch(`${base}/linkscribe/jobs`, {
    method: 'POST',
    headers: homeHeaders({ 'content-type': 'application/json' }),
    body,
  })
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  })
}
