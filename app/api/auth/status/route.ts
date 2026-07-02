import { NextResponse } from 'next/server'
import { getConnectionsStatus } from '@/lib/connections'

export async function GET() {
  return NextResponse.json(await getConnectionsStatus())
}
