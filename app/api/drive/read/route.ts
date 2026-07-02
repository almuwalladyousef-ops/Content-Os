import { NextRequest, NextResponse } from 'next/server'
import { getPersonalAccount } from '@/lib/accounts'
import { getDriveClient } from '@/lib/drive'

export async function GET(req: NextRequest) {
  const account = await getPersonalAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })

  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  try {
    const drive = getDriveClient(account.accessToken)
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
    return NextResponse.json(JSON.parse(res.data as string))
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
