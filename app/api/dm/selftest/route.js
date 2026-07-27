import { NextResponse } from 'next/server'
import axios from 'axios'
import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'
import { getRules } from '@/lib/dm/driveDB'

const FACEBOOK_BASE = 'https://graph.facebook.com/v21.0'
const INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0'

export const dynamic = 'force-dynamic'

// Comment triggers arrive on `comments`. A tapped quick-reply button arrives on
// `messages` — a SEPARATE subscription. With `messages` missing, step 1 works,
// the tap is never delivered, and the flow dies silently with nothing logged.
const REQUIRED_FIELDS = ['comments', 'messages']

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

function errorOf(err) {
  return err.response?.data?.error?.message ?? err.response?.data ?? err.message
}

async function inspectAccount(account) {
  const instagramLogin = isInstagramLoginToken(account.token)
  const base = instagramLogin ? INSTAGRAM_BASE : FACEBOOK_BASE
  const result = {
    name: account.name,
    igId: account.igId,
    authType: instagramLogin ? 'instagram' : 'facebook',
  }

  try {
    const me = await axios.get(`${base}/me`, {
      params: { fields: 'id,user_id,username,account_type', access_token: account.token },
    })
    result.token = { valid: true, error: null }
    result.me = me.data
  } catch (err) {
    result.token = { valid: false, error: errorOf(err) }
    return result
  }

  // Which webhook fields is this app actually subscribed to for this account?
  const subscriptionTarget = instagramLogin ? 'me' : account.pageId
  if (!subscriptionTarget) {
    result.subscriptions = { fields: [], error: 'no page id for this account' }
  } else {
    try {
      const subs = await axios.get(`${base}/${subscriptionTarget}/subscribed_apps`, {
        params: { access_token: account.token },
      })
      const entries = subs.data?.data ?? []
      const fields = entries.flatMap(e =>
        e.subscribed_fields ?? e.fields?.map(f => f.name ?? f) ?? []
      )
      result.subscriptions = { fields, error: null, raw: entries }
    } catch (err) {
      result.subscriptions = { fields: [], error: errorOf(err) }
    }
  }

  const fields = result.subscriptions.fields ?? []
  result.canReceiveComments = fields.includes('comments')
  result.canReceiveTaps = fields.includes('messages')
  result.missingFields = REQUIRED_FIELDS.filter(f => !fields.includes(f))
  return result
}

export async function GET() {
  const [accounts, rules] = await Promise.all([getAccountsWithStoredTokens(), getRules()])
  const inspected = await Promise.all(accounts.map(inspectAccount))
  const igIds = new Set(inspected.filter(a => a.token?.valid).map(a => a.igId))

  const problems = []
  for (const a of inspected) {
    if (!a.token?.valid) {
      problems.push(`${a.name}: token invalid — ${a.token?.error}. Reconnect it in Settings.`)
      continue
    }
    if (a.subscriptions?.error) {
      problems.push(`${a.name}: could not read webhook subscriptions — ${a.subscriptions.error}`)
      continue
    }
    if (!a.canReceiveComments) {
      problems.push(`${a.name}: NOT subscribed to "comments" — keyword comments never reach the app.`)
    }
    if (!a.canReceiveTaps) {
      problems.push(`${a.name}: NOT subscribed to "messages" — button taps never reach the app, so the DM can never send. POST /api/dm/setup-webhooks to fix.`)
    }
  }

  const activeRules = rules.filter(r => r.active)
  if (!activeRules.length) problems.push('No active rules.')
  for (const r of activeRules) {
    if (r.igId && !igIds.has(r.igId)) {
      problems.push(`Rule "${r.name}" targets IG account ${r.igId}, which has no valid token.`)
    }
    if (!r.anyComment && !r.keywords?.length) {
      problems.push(`Rule "${r.name}" has no keywords and is not set to any-comment, so it can never match.`)
    }
    if (!r.applyToAll && !r.targetReels?.length) {
      problems.push(`Rule "${r.name}" targets no reels and is not set to all reels, so it can never match.`)
    }
    if (!r.messages?.length) {
      problems.push(`Rule "${r.name}" has no message blocks — there is nothing to send.`)
    }
  }

  return NextResponse.json({
    ok: problems.length === 0,
    problems,
    accounts: inspected,
    rules: activeRules.map(r => ({
      id: r.id, name: r.name, igId: r.igId,
      keywords: r.keywords, anyComment: !!r.anyComment,
      applyToAll: !!r.applyToAll, targetReels: r.targetReels?.length ?? 0,
      messageBlocks: r.messages?.length ?? 0,
      buttonText: r.twoStepButtonText || '(default)',
    })),
  })
}
