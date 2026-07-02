import { NextRequest, NextResponse } from 'next/server'
import { homeBase, homeHeaders, homeUnavailable } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Poll a job's status/result from the mini.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const base = homeBase()
  if (!base) return homeUnavailable()
  const res = await fetch(`${base}/linkscribe/jobs/${encodeURIComponent(jobId)}`, {
    headers: homeHeaders(),
    cache: 'no-store',
  })
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  })
}
