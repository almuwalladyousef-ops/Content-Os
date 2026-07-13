import { NextRequest } from 'next/server'
import { homeBase, homeHeaders, homeUnavailable, proxyHomeJson } from '@/lib/home-proxy'

export const dynamic = 'force-dynamic'

// Create a transcription job on the mini. Returns { jobId, status, ... }.
export async function POST(req: NextRequest) {
  const base = homeBase()
  if (!base) return homeUnavailable()
  const body = await req.text()
  return proxyHomeJson(
    `${base}/linkscribe/jobs`,
    {
      method: 'POST',
      headers: homeHeaders({ 'content-type': 'application/json' }),
      body,
    },
    { action: 'start the transcription' },
  )
}
