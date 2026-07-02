import { NextRequest } from 'next/server'
import { homeBase, homeUnavailable, proxyStream } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Stream the downloaded video from the mini (Range-aware for seeking/preview).
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const base = homeBase()
  if (!base) return homeUnavailable()
  return proxyStream(`${base}/linkscribe/jobs/${encodeURIComponent(jobId)}/media`, req.headers.get('range'))
}
