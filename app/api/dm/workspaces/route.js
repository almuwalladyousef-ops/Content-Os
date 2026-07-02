import { NextResponse } from 'next/server'
import { createWorkspace, deleteWorkspace, getWorkspaces, updateWorkspace } from '@/lib/dm/workspaces'

export async function GET() {
  const workspaces = await getWorkspaces()
  return NextResponse.json(workspaces)
}

export async function POST(req) {
  const body = await req.json()
  const workspace = await createWorkspace(body || {})
  return NextResponse.json(workspace, { status: 201 })
}

export async function PATCH(req) {
  const body = await req.json()
  if (!body?.id) return NextResponse.json({ error: 'Workspace id required' }, { status: 400 })

  const workspace = await updateWorkspace(body.id, body)
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  return NextResponse.json(workspace)
}

export async function DELETE(req) {
  const body = await req.json()
  if (!body?.id) return NextResponse.json({ error: 'Workspace id required' }, { status: 400 })

  await deleteWorkspace(body.id)
  return NextResponse.json({ success: true })
}
