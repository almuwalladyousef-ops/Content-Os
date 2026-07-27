import { getWebhookLog, getFunnelStats, getPendingTwoStepList } from '@/lib/dm/driveDB'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [events, funnel, pending] = await Promise.all([
    getWebhookLog(),
    getFunnelStats(),
    getPendingTwoStepList(),
  ])
  return Response.json({ funnel, pending, events })
}
