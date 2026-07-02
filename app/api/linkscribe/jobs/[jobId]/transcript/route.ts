import { NextRequest } from 'next/server'
import { homeBase, homeUnavailable, proxyStream } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Stream the transcript .txt from the mini.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const base = homeBase()
  if (!base) return homeUnavailable()
  return proxyStream(`${base}/linkscribe/jobs/${encodeURIComponent(jobId)}/transcript`, null)
}
