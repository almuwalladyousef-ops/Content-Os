import { getWebhookLog } from '@/lib/dm/driveDB'

export async function GET() {
  const events = await getWebhookLog()
  return Response.json({ events })
}
