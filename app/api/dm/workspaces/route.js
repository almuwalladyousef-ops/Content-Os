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

  // DM-engine tokens connected before workspace cookies existed (or whose
  // cookie has since been cleared) aren't claimed by any workspace. Attach
  // them to the active workspace so those accounts stay usable.
  const claimedIgIds = new Set(withIg.map(w => w.igId).filter(Boolean))
  const unclaimed = accounts.filter(a => !claimedIgIds.has(a.igId))

  const workspaces = withIg.map(w => {
    let igId = w.igId
    let igUsername = w.igUsername
    if (!igId && w.id === state.activeId && unclaimed.length > 0) {
      igId = unclaimed[0].igId
      igUsername = unclaimed[0].username
    }
    const account = igId ? accounts.find(a => a.igId === igId) : null
    return {
      id: w.id,
      name: w.name,
      igId,
      accountName: account?.name || (igUsername ? `@${igUsername}` : null),
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
