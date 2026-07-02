import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'
import axios from 'axios'

const BASE = 'https://graph.facebook.com/v21.0'
const PAGE_FIELDS = 'feed,messages,message_reactions,messaging_handovers,message_edits'

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

export async function POST() {
  const accounts = await getAccountsWithStoredTokens()
  const results = []

  for (const account of accounts) {
    if (isInstagramLoginToken(account.token)) {
      results.push({
        account: account.name,
        success: true,
        skipped: true,
        message: 'Instagram Login tokens are configured in the Meta App Dashboard Instagram webhook subscription, not via Page subscribed_apps.',
      })
      continue
    }

    try {
      const res = await axios.post(
        `${BASE}/${account.pageId}/subscribed_apps`,
        { subscribed_fields: PAGE_FIELDS },
        { params: { access_token: account.token } }
      )
      results.push({ account: account.name, success: true, response: res.data })
    } catch (err) {
      results.push({
        account: account.name,
        success: false,
        error: err.response?.data ?? err.message,
      })
    }
  }

  return Response.json({ results })
}
