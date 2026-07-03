import { NextResponse } from 'next/server'
import { getRules, saveRule, deleteRules, bulkUpdateRules } from '@/lib/dm/driveDB'
import { v4 as uuid } from 'uuid'

const DEFAULT_TWO_STEP_BUTTON_TEXT = 'Send It In 5 min!'

function buildRule(body, id, createdAt) {
  return {
    id,
    name: body.name || 'Untitled Rule',
    active: body.active ?? true,
    workspaceId: body.workspaceId || null,
    igId: body.igId || null,
    applyToAll: body.applyToAll ?? false,
    targetReels: body.targetReels || [],
    keywords: body.keywords || [],
    matchMode: body.matchMode || 'any',        // 'any' | 'all'
    exactMatch: body.exactMatch ?? false,
    negativeKeywords: body.negativeKeywords || [],
    anyComment: body.anyComment ?? false,       // trigger on any comment
    dmKeywords: body.dmKeywords || [],          // inbound DM keywords
    perKeywordMessages: body.perKeywordMessages || {},
    messages: body.messages || [],
    twoStep: body.twoStep ?? false,
    twoStepPrompt: body.twoStepPrompt || '',
    twoStepButtonText: body.twoStepButtonText || DEFAULT_TWO_STEP_BUTTON_TEXT,
    fallbackMessage: body.fallbackMessage || '',
    commentReply: body.commentReply || 'Sent you a DM.',
    commentReplies: body.commentReplies || ['Sent you a DM.'],
    sendCap: body.sendCap ?? null,             // max DMs per day
    retriggerDays: body.retriggerDays ?? null, // allow re-trigger after N days
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    createdAt,
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const igId = searchParams.get('igId')
  const workspaceId = searchParams.get('workspaceId')
  const rules = await getRules()
  if (workspaceId) return NextResponse.json(rules.filter(r => r.workspaceId === workspaceId))
  return NextResponse.json(igId ? rules.filter(r => r.igId === igId) : rules)
}

export async function POST(req) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const body = await req.json()

  try {
    // Duplicate an existing rule
    if (action === 'duplicate' && body.sourceId) {
      const rules = await getRules()
      const source = rules.find(r => r.id === body.sourceId)
      if (!source) return NextResponse.json({ error: 'Source rule not found' }, { status: 404 })
      const now = new Date().toISOString()
      const duplicate = {
        ...source,
        id: uuid(),
        name: `${source.name} (Copy)`,
        active: false,
        createdAt: now,
        updatedAt: now,
      }
      await saveRule(duplicate)
      return NextResponse.json(duplicate, { status: 201 })
    }

    const rule = buildRule(body, uuid(), new Date().toISOString())
    const saved = await saveRule(rule)
    return NextResponse.json(saved, { status: 201 })
  } catch (err) {
    console.error('[dm/rules] save failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  const body = await req.json()
  const ids = Array.isArray(body?.ids) ? body.ids : []
  if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

  const fields = {}
  if (typeof body.active === 'boolean') fields.active = body.active

  if (!Object.keys(fields).length) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

  try {
    await bulkUpdateRules(ids, fields)
    return NextResponse.json({ success: true, updated: ids.length })
  } catch (err) {
    console.error('[dm/rules] bulk update failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  const body = await req.json()
  const ids = Array.isArray(body?.ids) ? body.ids : []
  if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
  try {
    await deleteRules(ids)
    return NextResponse.json({ success: true, deleted: ids.length })
  } catch (err) {
    console.error('[dm/rules] delete failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
