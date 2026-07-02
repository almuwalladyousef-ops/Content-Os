import { NextRequest, NextResponse } from 'next/server'
import { getPersonalAccount } from '@/lib/accounts'
import { getHistory, addHistoryEntry, clearHistory } from '@/lib/history'
import { PostRecord } from '@/lib/types'

export async function GET() {
  const account = await getPersonalAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })
  try {
    const history = await getHistory(account.accessToken)
    return NextResponse.json(history)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const account = await getPersonalAccount()
  if (!account) return NextResponse.json({ error: 'No account connected' }, { status: 401 })
  try {
    const { action, entry } = await req.json()
    if (action === 'clear') {
      await clearHistory(account.accessToken)
    } else if (action === 'add' && entry) {
      await addHistoryEntry(account.accessToken, entry as PostRecord)
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
