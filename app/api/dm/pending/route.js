import { NextResponse } from 'next/server'
import { getPendingTwoStepList, clearPendingTwoStepForUsers, pendingAgeMs, PENDING_TTL_MS } from '@/lib/dm/driveDB'

export const dynamic = 'force-dynamic'

// Pending two-step prompts: who has been asked but has not tapped yet.
export async function GET() {
  const pending = await getPendingTwoStepList()
  return NextResponse.json({
    pending: pending.map(p => ({
      ...p,
      ageMinutes: Math.round(pendingAgeMs(p) / 60000),
      expired: pendingAgeMs(p) > PENDING_TTL_MS,
    })),
  })
}

// Clear stuck prompts. Body { userIds: [...] } clears those users, no body clears all.
export async function DELETE(req) {
  const body = await req.json().catch(() => ({}))
  const result = await clearPendingTwoStepForUsers(body?.userIds ?? null)
  return NextResponse.json({ success: true, ...result })
}
