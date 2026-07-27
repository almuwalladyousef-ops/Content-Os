import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'
import axios from 'axios'

const FACEBOOK_BASE = 'https://graph.facebook.com/v21.0'
const INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0'
const PAGE_FIELDS = 'feed,messages,message_reactions,messaging_handovers,message_edits'
// `comments` delivers keyword comments; `messages` delivers the quick-reply tap
// that completes the two-step flow. Without `messages` the DM can never send.
const INSTAGRAM_FIELDS = 'comments,messages,messaging_postbacks,messaging_optins,message_reactions'

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

function errorOf(err) {
  return err.response?.data?.error?.message ?? err.response?.data ?? err.message
}

export async function POST() {
  const accounts = await getAccountsWithStoredTokens()
  const results = []

  for (const account of accounts) {
    if (isInstagramLoginToken(account.token)) {
      // Instagram Login accounts subscribe through graph.instagram.com/me,
      // not through Page subscribed_apps.
      try {
        const res = await axios.post(
          `${INSTAGRAM_BASE}/me/subscribed_apps`,
          null,
          { params: { subscribed_fields: INSTAGRAM_FIELDS, access_token: account.token } }
        )
        let fields = []
        try {
          const check = await axios.get(`${INSTAGRAM_BASE}/me/subscribed_apps`, {
            params: { access_token: account.token },
          })
          fields = (check.data?.data ?? []).flatMap(e => e.subscribed_fields ?? [])
        } catch {
          // Subscribing succeeded; the read-back is only for reporting.
        }
        results.push({ account: account.name, success: true, authType: 'instagram', response: res.data, subscribedFields: fields })
      } catch (err) {
        results.push({ account: account.name, success: false, authType: 'instagram', error: errorOf(err) })
      }
      continue
    }

    try {
      const res = await axios.post(
        `${FACEBOOK_BASE}/${account.pageId}/subscribed_apps`,
        { subscribed_fields: PAGE_FIELDS },
        { params: { access_token: account.token } }
      )
      results.push({ account: account.name, success: true, authType: 'facebook', response: res.data })
    } catch (err) {
      results.push({ account: account.name, success: false, authType: 'facebook', error: errorOf(err) })
    }
  }

  return Response.json({ results })
}
