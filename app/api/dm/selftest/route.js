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

/**
 * Step 2 sends to `recipient: {id}` — a standard message, which needs the
 * messaging permission AND an open messaging window. A missing permission and a
 * closed window fail very differently, and we can tell them apart without
 * messaging anyone: send to a deliberately invalid recipient. Instagram rejects
 * the RECIPIENT only after it has accepted the permission, so "no matching
 * user" proves the permission is in place. Nothing is ever delivered.
 */
/**
 * Listing conversations requires the messaging permission, so this is a clean
 * read-only test of whether the account actually granted it. Stronger evidence
 * than the send probe below: sending to an invalid recipient may be rejected on
 * recipient lookup BEFORE the permission is ever evaluated.
 */
async function probeMessagingPermission(account) {
  const base = isInstagramLoginToken(account.token) ? INSTAGRAM_BASE : FACEBOOK_BASE
  const target = isInstagramLoginToken(account.token) ? 'me' : account.igId
  try {
    const res = await axios.get(`${base}/${target}/conversations`, {
      params: { access_token: account.token, limit: 1 },
    })
    return { granted: true, conversations: res.data?.data?.length ?? 0, error: null }
  } catch (err) {
    const e = err.response?.data?.error
    return {
      granted: false,
      code: e?.code,
      error: e?.message ?? err.message,
      note: 'cannot read the inbox — the messaging permission is very likely not granted, which also means tap webhooks are never delivered',
    }
  }
}

async function probeSendPermission(account) {
  const base = isInstagramLoginToken(account.token) ? INSTAGRAM_BASE : FACEBOOK_BASE
  const target = isInstagramLoginToken(account.token) ? 'me' : account.igId
  try {
    await axios.post(
      `${base}/${target}/messages`,
      { recipient: { id: '0' }, message: { text: 'permission probe — not delivered' } },
      { params: { access_token: account.token } }
    )
    return { permissionOk: null, note: 'probe unexpectedly succeeded; treat with suspicion' }
  } catch (err) {
    const e = err.response?.data?.error
    const message = e?.message ?? err.message
    const code = e?.code
    const lower = String(message).toLowerCase()

    if (lower.includes('permission') || code === 200 || code === 10) {
      return { permissionOk: false, code, message, note: 'messaging permission is MISSING — step 2 can never send' }
    }
    if (lower.includes('token')) {
      return { permissionOk: false, code, message, note: 'token problem' }
    }
    // Recipient rejected => the request got past permission checks.
    return { permissionOk: true, code, message, note: 'permission present (recipient rejected, as expected)' }
  }
}

/**
 * Reads the newest thread. If the user's tap is sitting in the inbox but no
 * webhook ever arrived, the problem is webhook DELIVERY, not our handling —
 * which is the difference between a code bug and a Meta-side setting.
 */
async function readInbox(account) {
  const base = isInstagramLoginToken(account.token) ? INSTAGRAM_BASE : FACEBOOK_BASE
  const target = isInstagramLoginToken(account.token) ? 'me' : account.igId
  try {
    const convos = await axios.get(`${base}/${target}/conversations`, {
      params: { access_token: account.token, fields: 'id,updated_time', limit: 3 },
    })
    const threads = []
    for (const convo of convos.data?.data ?? []) {
      const msgs = await axios.get(`${base}/${convo.id}`, {
        params: { access_token: account.token, fields: 'messages{id,from,created_time,message}' },
      })
      threads.push({
        id: convo.id,
        updated: convo.updated_time,
        messages: (msgs.data?.messages?.data ?? []).slice(0, 8).map(m => ({
          from: m.from?.id ?? m.from?.username ?? null,
          at: m.created_time,
          text: String(m.message ?? '').slice(0, 60),
        })),
      })
    }
    return threads
  } catch (err) {
    return { error: err.response?.data?.error?.message ?? err.message }
  }
}

/**
 * Webhook delivery has TWO layers and both must be on:
 *   1. App level  — App Dashboard > Webhooks > Instagram: which fields Meta
 *      will send to the callback URL at all. Dashboard-only, no API to set it.
 *   2. Account level — POST /me/subscribed_apps, which /api/dm/setup-webhooks does.
 * With `comments` on at layer 1 but not `messages`, comment events arrive and
 * message events never do — no error anywhere, just silence.
 */
async function readAppSubscriptions() {
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appId || !appSecret) return { error: 'INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET not set' }
  try {
    const res = await axios.get(`${FACEBOOK_BASE}/${appId}/subscriptions`, {
      params: { access_token: `${appId}|${appSecret}` },
    })
    const objects = {}
    for (const entry of res.data?.data ?? []) {
      objects[entry.object] = {
        callbackUrl: entry.callback_url,
        active: entry.active,
        fields: (entry.fields ?? []).map(f => f.name ?? f),
      }
    }
    return objects
  } catch (err) {
    return { error: err.response?.data?.error?.message ?? err.message }
  }
}

export async function GET(req) {
  const params = new URL(req.url).searchParams
  const probe = params.get('probe') === '1'
  const inbox = params.get('inbox') === '1'
  const [accounts, rules, appSubscriptions] = await Promise.all([
    getAccountsWithStoredTokens(),
    getRules(),
    readAppSubscriptions(),
  ])
  const inspected = await Promise.all(accounts.map(inspectAccount))

  if (probe) {
    await Promise.all(inspected.map(async (a, i) => {
      if (!a.token?.valid) return
      a.messagingPermission = await probeMessagingPermission(accounts[i])
      a.sendProbe = await probeSendPermission(accounts[i])
    }))
  }

  if (inbox) {
    await Promise.all(inspected.map(async (a, i) => {
      if (a.token?.valid) a.inbox = await readInbox(accounts[i])
    }))
  }
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
    if (a.sendProbe?.permissionOk === false) {
      problems.push(`${a.name}: ${a.sendProbe.note} — ${a.sendProbe.message}`)
    }
  }

  const igApp = appSubscriptions?.instagram
  if (igApp && !igApp.fields?.includes('messages')) {
    problems.push(
      'APP-LEVEL webhook is missing the "messages" field. Comments arrive, button taps never do. ' +
      'Fix in the Meta App Dashboard > Webhooks > Instagram: subscribe to "messages". This cannot be set over the API.'
    )
  }
  if (appSubscriptions?.error) {
    problems.push(`Could not read app-level webhook config — ${appSubscriptions.error}`)
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
    appSubscriptions,
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
