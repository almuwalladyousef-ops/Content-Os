import { NextRequest } from 'next/server'
import { homeBase, homeHeaders, homeUnavailable, proxyHomeJson } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Poll a job's status/result from the mini.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const base = homeBase()
  if (!base) return homeUnavailable()
  return proxyHomeJson(
    `${base}/linkscribe/jobs/${encodeURIComponent(jobId)}`,
    { headers: homeHeaders() },
    { action: 'check the transcription' },
  )
}
