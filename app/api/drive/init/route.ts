import { NextResponse } from 'next/server'
import { getPersonalAccount } from '@/lib/accounts'
import { ensureFolderStructure } from '@/lib/drive'

export async function POST() {
  const account = await getPersonalAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })
  try {
    const folders = await ensureFolderStructure(account.accessToken)
    return NextResponse.json(folders)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
