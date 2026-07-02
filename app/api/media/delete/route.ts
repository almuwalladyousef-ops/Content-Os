import { NextRequest, NextResponse } from 'next/server'
import { deleteFile } from '@/lib/home-storage'

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json()
    if (key) await deleteFile(String(key))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
