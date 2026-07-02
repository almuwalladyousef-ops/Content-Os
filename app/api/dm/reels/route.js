import { NextResponse } from 'next/server'
import { getReels } from '@/lib/dm/instagram'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const igId = searchParams.get('igId')
  const reels = await getReels()
  return NextResponse.json(igId ? reels.filter(r => r.igId === igId) : reels)
}
