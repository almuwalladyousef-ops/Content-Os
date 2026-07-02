import { NextResponse } from 'next/server'
import axios from 'axios'
import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'
import { getStoredTokenRecord } from '@/lib/dm/driveDB'
import { getWorkspaces } from '@/lib/dm/workspaces'

const FACEBOOK_BASE = 'https://graph.facebook.com/v21.0'
const INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0'

export const dynamic = 'force-dynamic'

async function checkToken(account) {
  const base = account.token?.startsWith('IGA') ? INSTAGRAM_BASE : FACEBOOK_BASE
  try {
    await axios.get(`${base}/me`, {
      params: { fields: 'id,name', access_token: account.token },
    })
    return { valid: true, error: null }
  } catch (err) {
    const e = err.response?.data?.error
    return { valid: false, error: e?.message || err.message }
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  if (workspaceId) {
    const workspaces = await getWorkspaces()
    const workspace = workspaces.find(w => w.id === workspaceId)
    if (!workspace) return NextResponse.json([])

    const tokenKey = workspace.tokenKey || `WORKSPACE_TOKEN:${workspace.id}`
    const stored = await getStoredTokenRecord(tokenKey)
    if (!workspace.igId || !stored?.token) {
      return NextResponse.json([{
        name: workspace.name,
        igId: workspace.igId || null,
        key: tokenKey,
        workspaceId: workspace.id,
        authType: 'instagram',
        valid: false,
        connected: false,
        error: 'No Instagram account connected to this workspace.',
      }])
    }

    const account = {
      name: workspace.accountName || workspace.igUsername || workspace.name,
      igId: workspace.igId,
      key: tokenKey,
      token: stored.token,
      workspaceId: workspace.id,
    }
    const { valid, error } = await checkToken(account)
    return NextResponse.json([{
      name: account.name,
      igId: account.igId,
      key: tokenKey,
      workspaceId: workspace.id,
      authType: account.token?.startsWith('IGA') ? 'instagram' : 'facebook',
      valid,
      connected: valid,
      error,
    }])
  }

  const accounts = await getAccountsWithStoredTokens()
  const results = await Promise.all(
    accounts.map(async account => {
      const { valid, error } = await checkToken(account)
      return {
        name: account.name,
        igId: account.igId,
        key: account.key,
        authType: account.token?.startsWith('IGA') ? 'instagram' : 'facebook',
        valid,
        error,
      }
    })
  )
  return NextResponse.json(results)
}
