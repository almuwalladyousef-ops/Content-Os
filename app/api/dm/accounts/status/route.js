import { NextResponse } from 'next/server'
import axios from 'axios'
import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'
import { getWorkspaces, getInstagramConnectionForWorkspace, getWorkspacesWithInstagram } from '@/lib/connections'

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
    const state = await getWorkspaces()
    const workspace = state.workspaces.find(w => w.id === workspaceId)
    if (!workspace) return NextResponse.json([])

    const [ig, accounts, withIg] = await Promise.all([
      getInstagramConnectionForWorkspace(workspaceId),
      getAccountsWithStoredTokens(),
      getWorkspacesWithInstagram(),
    ])
    let account = ig ? accounts.find(a => a.igId === ig.accountId) : null

    // Same fallback as /api/dm/workspaces: a stored DM-engine token no
    // workspace cookie claims belongs to the active workspace.
    if (!account && !ig && workspace.id === state.activeId) {
      const claimed = new Set(withIg.map(w => w.igId).filter(Boolean))
      account = accounts.find(a => !claimed.has(a.igId)) || null
    }

    if (!account) {
      return NextResponse.json([{
        name: workspace.name,
        igId: ig?.accountId || null,
        key: workspace.id,
        workspaceId: workspace.id,
        authType: 'instagram',
        valid: false,
        connected: false,
        error: 'No Instagram account connected to this workspace.',
      }])
    }

    const { valid, error } = await checkToken(account)
    return NextResponse.json([{
      name: account.name,
      igId: account.igId,
      key: account.key,
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
