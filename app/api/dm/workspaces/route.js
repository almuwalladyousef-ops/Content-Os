import { NextResponse } from 'next/server'
import {
  getWorkspaces,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  getWorkspacesWithInstagram,
} from '@/lib/connections'
import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'

// DM automation shares the same workspace concept as the rest of the suite
// (lib/connections.ts) — no separate workspace store. This endpoint just
// annotates each workspace with the Instagram account (if any) connected to
// it, plus whether that account's DM-engine token is actually stored.
export async function GET() {
  const [withIg, state, accounts] = await Promise.all([
    getWorkspacesWithInstagram(),
    getWorkspaces(),
    getAccountsWithStoredTokens(),
  ])

  const workspaces = withIg.map(w => {
    const account = w.igId ? accounts.find(a => a.igId === w.igId) : null
    return {
      id: w.id,
      name: w.name,
      igId: w.igId,
      accountName: account?.name || (w.igUsername ? `@${w.igUsername}` : null),
      connected: !!account,
      active: w.id === state.activeId,
    }
  })

  return NextResponse.json(workspaces)
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const state = await createWorkspace(typeof body?.name === 'string' ? body.name : undefined)
  const created = state.workspaces.find(w => w.id === state.activeId)
  return NextResponse.json({
    id: created.id,
    name: created.name,
    igId: null,
    accountName: null,
    connected: false,
    active: true,
  }, { status: 201 })
}

export async function PATCH(req) {
  const body = await req.json().catch(() => ({}))
  if (!body?.id || typeof body?.name !== 'string') {
    return NextResponse.json({ error: 'Workspace id and name required' }, { status: 400 })
  }
  await renameWorkspace(body.id, body.name)
  return NextResponse.json({ success: true })
}

export async function DELETE(req) {
  const body = await req.json().catch(() => ({}))
  if (!body?.id) return NextResponse.json({ error: 'Workspace id required' }, { status: 400 })
  await deleteWorkspace(body.id)
  return NextResponse.json({ success: true })
}
