import { NextResponse } from 'next/server'
import axios from 'axios'

const FACEBOOK_BASE = 'https://graph.facebook.com/v21.0'

export const dynamic = 'force-dynamic'

/**
 * Repoints the Meta app's Instagram webhook at THIS deployment.
 *
 * Webhook delivery has two layers. /api/dm/setup-webhooks handles the
 * per-account layer. This is the app layer: one callback URL per object for the
 * whole app, which decides where Meta sends events at all. It pointed at the
 * previous TriggerDM deployment, so message events went there and never here.
 *
 * Existing fields are read first and merged, never replaced — POSTing a short
 * field list would silently unsubscribe everything left out of it.
 */
const REQUIRED_FIELDS = ['comments', 'messages', 'messaging_postbacks', 'messaging_optins']

function appCredentials() {
  const pairs = [
    { label: 'FACEBOOK_APP_ID', id: process.env.FACEBOOK_APP_ID, secret: process.env.FACEBOOK_APP_SECRET },
    { label: 'INSTAGRAM_APP_ID', id: process.env.INSTAGRAM_APP_ID, secret: process.env.INSTAGRAM_APP_SECRET },
  ]
  return pairs.filter(p => p.id && p.secret)
}

async function readInstagramSubscription(id, secret) {
  const res = await axios.get(`${FACEBOOK_BASE}/${id}/subscriptions`, {
    params: { access_token: `${id}|${secret}` },
  })
  const entry = (res.data?.data ?? []).find(e => e.object === 'instagram')
  if (!entry) return null
  return {
    callbackUrl: entry.callback_url,
    active: entry.active,
    fields: (entry.fields ?? []).map(f => f.name ?? f),
  }
}

export async function POST(req) {
  const verifyToken = process.env.VERIFY_TOKEN
  if (!verifyToken) {
    return NextResponse.json({ error: 'VERIFY_TOKEN is not set — Meta cannot verify the callback URL.' }, { status: 400 })
  }

  const origin = process.env.NEXTAUTH_URL?.replace(/\/+$/, '') || new URL(req.url).origin
  const callbackUrl = `${origin}/api/dm/webhook`
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'

  const creds = appCredentials()
  if (!creds.length) return NextResponse.json({ error: 'No app credentials configured.' }, { status: 400 })

  const attempts = []
  for (const cred of creds) {
    let before
    try {
      before = await readInstagramSubscription(cred.id, cred.secret)
    } catch (err) {
      attempts.push({ credential: cred.label, stage: 'read', error: err.response?.data?.error?.message ?? err.message })
      continue
    }

    const fields = [...new Set([...(before?.fields ?? []), ...REQUIRED_FIELDS])]
    const plan = { credential: cred.label, before, willSet: { callbackUrl, fields } }

    if (dryRun) {
      attempts.push({ ...plan, dryRun: true })
      continue
    }

    try {
      await axios.post(`${FACEBOOK_BASE}/${cred.id}/subscriptions`, null, {
        params: {
          object: 'instagram',
          callback_url: callbackUrl,
          fields: fields.join(','),
          verify_token: verifyToken,
          include_values: 'true',
          access_token: `${cred.id}|${cred.secret}`,
        },
      })
      const after = await readInstagramSubscription(cred.id, cred.secret)
      return NextResponse.json({ success: true, ...plan, after, attempts })
    } catch (err) {
      attempts.push({ ...plan, stage: 'write', error: err.response?.data?.error?.message ?? err.message })
    }
  }

  return NextResponse.json({ success: false, dryRun, attempts }, { status: dryRun ? 200 : 502 })
}
