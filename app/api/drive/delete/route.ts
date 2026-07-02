import { NextRequest, NextResponse } from 'next/server'
import { getPersonalAccount } from '@/lib/accounts'
import { deleteFile } from '@/lib/drive'

export async function POST(req: NextRequest) {
  const account = await getPersonalAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  try {
    const { fileId } = await req.json()
    await deleteFile(account.accessToken, fileId)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
