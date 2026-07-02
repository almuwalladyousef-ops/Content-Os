import { NextResponse } from 'next/server'
import { getRules, saveRule, deleteRule, resetRuleDmedLog } from '@/lib/dm/driveDB'
import { sendDMToUser } from '@/lib/dm/instagram'
import { getAccountByIgIdWithStoredToken } from '@/lib/dm/accounts'

export async function GET(req, { params }) {
  const { id } = await params
  const rules = await getRules()
  const rule = rules.find(r => r.id === id)
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rule)
}

export async function PUT(req, { params }) {
  const { id } = await params
  const body = await req.json()
  const rules = await getRules()
  const existing = rules.find(r => r.id === id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = { ...existing, ...body, id }
  const saved = await saveRule(updated)
  return NextResponse.json(saved)
}

export async function DELETE(req, { params }) {
  const { id } = await params
  await deleteRule(id)
  return NextResponse.json({ success: true })
}

// POST /api/dm/rules/[id]?action=reset-log   — clear dmedLog for this rule
// POST /api/dm/rules/[id]?action=test-send   — fire a test DM to a specific userId
export async function POST(req, { params }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'reset-log') {
    await resetRuleDmedLog(id)
    return NextResponse.json({ success: true })
  }

  if (action === 'test-send') {
    const body = await req.json()
    const userId = body?.userId
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const rules = await getRules()
    const rule = rules.find(r => r.id === id)
    if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

    const account = await getAccountByIgIdWithStoredToken(rule.igId)
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    try {
      await sendDMToUser(userId, rule.messages, account.token, account.igId, { name: 'Test User', username: '' })
      return NextResponse.json({ success: true })
    } catch (err) {
      return NextResponse.json({ error: err.response?.data?.error?.message ?? err.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
