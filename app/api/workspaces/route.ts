import { NextRequest, NextResponse } from 'next/server'
import {
  getWorkspaces,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
} from '@/lib/connections'

export async function GET() {
  return NextResponse.json(await getWorkspaces())
}

export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}))
  return NextResponse.json(await createWorkspace(typeof name === 'string' ? name : undefined))
}

export async function PATCH(req: NextRequest) {
  const { id, name } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || typeof name !== 'string') {
    return NextResponse.json({ error: 'id and name are required' }, { status: 400 })
  }
  return NextResponse.json(await renameWorkspace(id, name))
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  return NextResponse.json(await deleteWorkspace(id))
}
