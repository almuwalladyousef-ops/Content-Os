import { NextRequest, NextResponse } from 'next/server'
import { switchWorkspace } from '@/lib/connections'

export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  return NextResponse.json(await switchWorkspace(id))
}
