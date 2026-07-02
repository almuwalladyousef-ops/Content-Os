import { verifySignature } from '@/lib/dm/verify'
import {
  getRules, hasBeenDMed, logDM, logWebhookEvent,
  setPendingTwoStep, getPendingTwoStepForUser, clearPendingTwoStep,
  checkAndIncrementSendCap,
} from '@/lib/dm/driveDB'
import {
  replyToComment, sendPrivateReply, sendPrivateReplyWithButton,
  sendDMToUser, fetchUserName,
} from '@/lib/dm/instagram'
import { getAccountByIgIdWithStoredToken, getAccountsWithStoredTokens, resolveAccountForWebhookId } from '@/lib/dm/accounts'
import axios from 'axios'

const BASE = 'https://graph.facebook.com/v21.0'
const PAGE_WEBHOOK_FIELDS = 'feed,messages,message_reactions,messaging_handovers,message_edits'
const DEFAULT_COMMENT_REPLY = 'Sent you a DM.'

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

async function subscribeAllPages() {
  const accounts = await getAccountsWithStoredTokens()
  for (const account of accounts) {
    if (isInstagramLoginToken(account.token)) {
      console.log('[webhook] skipping page subscription for Instagram Login token:', account.name)
      continue
    }
    try {
      await axios.post(
        `${BASE}/${account.pageId}/subscribed_apps`,
        { subscribed_fields: PAGE_WEBHOOK_FIELDS },
        { params: { access_token: account.token } }
      )
      console.log('[webhook] subscribed page for:', account.name)
    } catch (err) {
      console.error('[webhook] failed to subscribe page for:', account.name, err.response?.data ?? err.message)
    }
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    subscribeAllPages().catch(console.error)
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  const accounts = await getAccountsWithStoredTokens()
  const validSig = accounts.some(a => verifySignature(rawBody, signature, a.appSecret))
  if (!validSig && process.env.ALLOW_UNVERIFIED_WEBHOOKS !== 'true') {
    console.error('[webhook] rejected: invalid signature')
    return new Response('Forbidden', { status: 403 })
  }
  if (!validSig) console.warn('[webhook] accepted with invalid signature because ALLOW_UNVERIFIED_WEBHOOKS=true')

  await processWebhook(rawBody)
  return new Response('OK', { status: 200 })
}

async function processWebhook(rawBody) {
  const body = JSON.parse(rawBody)
  console.log('[webhook] received:', JSON.stringify(body).slice(0, 500))
  await logWebhookEvent({
    type: 'received',
    object: body.object,
    entries: (body.entry || []).map(entry => ({
      id: entry?.id,
      changes: (entry?.changes || []).map(change => ({
        field: change?.field,
        valueId: change?.value?.id,
        text: change?.value?.text,
        mediaId: change?.value?.media?.id,
        fromId: change?.value?.from?.id,
      })),
    })),
  })

  for (const entry of body.entry || []) {
    const igAccountId = entry?.id

    // Handle inbound DM messages (for two-step flow + DM keyword triggers)
    for (const msg of entry?.messaging || []) {
      await processInboundMessage(igAccountId, msg)
    }

    for (const change of entry?.changes || []) {
      await processChange(igAccountId, change)
    }
  }
}

// Inbound DM: handle two-step button taps and DM keyword triggers
async function processInboundMessage(igAccountId, msg) {
  if (msg?.message?.is_echo) {
    await logWebhookEvent({ type: 'skipped_message_echo', igAccountId, messageId: msg?.message?.mid })
    return
  }

  const senderId = msg?.sender?.id
  if (!senderId) return

  const text = (msg?.message?.text || '').toLowerCase()
  const quickReplyPayload = msg?.message?.quick_reply?.payload

  // Two-step: if this user has a pending two-step, complete it on ANY inbound message.
  // We intentionally don't gate on account lookup here because the entry.id for messaging
  // events may differ from the igId stored on the rule (page ID vs Instagram account ID).
  const pending = await getPendingTwoStepForUser(senderId)
  if (pending) {
    const rules = await getRules()
    const rule = rules.find(r => r.id === pending.ruleId)
    if (rule) {
      // Resolve account: try by igAccountId first, then by rule.igId, then first account
      const account = await resolveAccountForWebhookId(igAccountId)
        || await getAccountByIgIdWithStoredToken(rule.igId)
        || (await getAccountsWithStoredTokens())[0]
      if (account) {
        const alreadyDMed = await hasBeenDMed(rule.id, senderId, rule.retriggerDays ?? null)
        await clearPendingTwoStep(rule.id, senderId)
        if (alreadyDMed) {
          await logWebhookEvent({ type: 'two_step_skipped_already_completed', ruleId: rule.id, ruleName: rule.name, senderId })
          return
        }

        try {
          const userInfo = await fetchUserName(senderId, account.token)
          const messages = pending.keyword && rule.perKeywordMessages?.[pending.keyword]
            ? rule.perKeywordMessages[pending.keyword]
            : rule.messages
          await sendDMToUser(senderId, messages, account.token, account.igId, userInfo)
          await logDM(rule.id, senderId)
          await logWebhookEvent({ type: 'two_step_completed', ruleId: rule.id, ruleName: rule.name, senderId })
        } catch (err) {
          await logWebhookEvent({ type: 'two_step_failed', ruleId: rule?.id, error: err.message })
        }
        return
      }
    }
    // Pending exists but rule/account not found — clear stale pending
    await clearPendingTwoStep(pending.ruleId, senderId)
    return
  }

  if (quickReplyPayload === 'TRIGGER_STEP2') {
    await logWebhookEvent({ type: 'two_step_button_ignored_without_pending', igAccountId, senderId })
    return
  }

  const account = await resolveAccountForWebhookId(igAccountId)
  if (!account) {
    await logWebhookEvent({ type: 'skipped_message_no_account', igAccountId, senderId, text })
    return
  }

  // DM keyword triggers
  if (!text) return
  const rules = await getRules()
  for (const rule of rules) {
    if (!rule.active || !rule.dmKeywords?.length) continue
    if (rule.igId && rule.igId !== account.igId) continue
    const matched = rule.dmKeywords.some(kw => text.includes(kw.toLowerCase()))
    if (!matched) continue
    const alreadyDMed = await hasBeenDMed(rule.id, senderId, rule.retriggerDays ?? null)
    if (alreadyDMed) continue
    const withinCap = await checkAndIncrementSendCap(rule.id, rule.sendCap || null)
    if (!withinCap) continue
    try {
      const userInfo = await fetchUserName(senderId, account.token)
      await sendDMToUser(senderId, rule.messages, account.token, account.igId, userInfo)
      await logDM(rule.id, senderId)
      await logWebhookEvent({ type: 'dm_keyword_triggered', ruleId: rule.id, ruleName: rule.name, senderId, text })
    } catch (err) {
      await logWebhookEvent({ type: 'dm_keyword_failed', ruleId: rule.id, error: err.message })
    }
  }
}

// Keyword matching with support for matchMode, exactMatch, negativeKeywords, anyComment
function matchesKeywords(commentText, rule) {
  const lower = commentText.toLowerCase()

  if (rule.anyComment) return true

  if (!rule.keywords?.length) return false

  // Negative keywords block the trigger
  if (rule.negativeKeywords?.length) {
    const blocked = rule.negativeKeywords.some(nk =>
      rule.exactMatch
        ? new RegExp(`\\b${escapeRegex(nk.toLowerCase())}\\b`).test(lower)
        : lower.includes(nk.toLowerCase())
    )
    if (blocked) return false
  }

  const matchFn = rule.exactMatch
    ? kw => new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`).test(lower)
    : kw => lower.includes(kw.toLowerCase())

  return rule.matchMode === 'all'
    ? rule.keywords.every(matchFn)
    : rule.keywords.some(matchFn)
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Pick which messages to send for a matched keyword
function getMessagesForMatch(rule, commentText) {
  if (rule.perKeywordMessages && Object.keys(rule.perKeywordMessages).length > 0) {
    const lower = commentText.toLowerCase()
    for (const [kw, msgs] of Object.entries(rule.perKeywordMessages)) {
      if (lower.includes(kw.toLowerCase()) && msgs?.length) return { messages: msgs, keyword: kw }
    }
  }
  return { messages: rule.messages, keyword: null }
}

// Check schedule/expiry dates
function isWithinSchedule(rule) {
  const now = new Date()
  if (rule.startDate && new Date(rule.startDate) > now) return false
  if (rule.endDate && new Date(rule.endDate) < now) return false
  return true
}

async function processChange(igAccountId, change) {
  console.log('[webhook] field:', change?.field, '| igAccountId:', igAccountId)
  if (change?.field !== 'comments') {
    await logWebhookEvent({ type: 'skipped_field', igAccountId, field: change?.field })
    return
  }

  const commentText = change.value?.text || ''
  const commentId = change.value?.id
  const commenterId = change.value?.from?.id
  const mediaId = change.value?.media?.id

  console.log('[webhook] comment:', commentText, '| commentId:', commentId, '| commenter:', commenterId, '| media:', mediaId)

  if (!commenterId || !commentId || !commentText) {
    await logWebhookEvent({ type: 'skipped_missing_comment_data', igAccountId, commentId, commenterId, commentText, mediaId })
    return
  }

  const account = await resolveAccountForWebhookId(igAccountId)
  if (!account) {
    await logWebhookEvent({ type: 'skipped_no_account', igAccountId, commentId, commenterId, commentText, mediaId })
    return
  }

  const rules = await getRules()

  for (const rule of rules) {
    if (!rule.active) continue
    if (rule.igId && rule.igId !== account.igId) continue
    if (!isWithinSchedule(rule)) { console.log('[webhook] rule', rule.name, 'skipped: outside schedule'); continue }

    const appliesToReel = rule.applyToAll || rule.targetReels?.includes(mediaId)
    if (!appliesToReel) { console.log('[webhook] rule', rule.name, 'skipped: reel mismatch'); continue }

    if (!matchesKeywords(commentText, rule)) {
      await logWebhookEvent({ type: 'skipped_no_keyword_match', account: account.name, ruleId: rule.id, ruleName: rule.name, keywords: rule.keywords, commentText, mediaId })
      console.log('[webhook] rule', rule.name, 'skipped: no keyword match')
      continue
    }

    const alreadyDMed = await hasBeenDMed(rule.id, commenterId, rule.retriggerDays ?? null)
    if (alreadyDMed) {
      await logWebhookEvent({ type: 'skipped_already_dmed', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentText, mediaId })
      console.log('[webhook] rule', rule.name, 'skipped: already DMed')
      continue
    }

    if (rule.twoStep) {
      const pending = await getPendingTwoStepForUser(commenterId)
      if (pending?.ruleId === rule.id) {
        await logWebhookEvent({ type: 'skipped_two_step_already_pending', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentText, mediaId })
        console.log('[webhook] rule', rule.name, 'skipped: two-step already pending')
        continue
      }
    }

    const withinCap = await checkAndIncrementSendCap(rule.id, rule.sendCap || null)
    if (!withinCap) {
      await logWebhookEvent({ type: 'skipped_send_cap', account: account.name, ruleId: rule.id, ruleName: rule.name })
      console.log('[webhook] rule', rule.name, 'skipped: daily send cap reached')
      continue
    }

    const userInfo = await fetchUserName(commenterId, account.token).catch(() => ({ name: '', username: '' }))
    const { messages, keyword } = getMessagesForMatch(rule, commentText)

    try {
      if (rule.twoStep) {
        // Step 1: send prompt + quick reply button
        const prompt = rule.twoStepPrompt || 'Want me to send the link?'
        const btnText = rule.twoStepButtonText || 'Send It In 5 min!'
        await sendPrivateReplyWithButton(commentId, prompt, btnText, account.token, account.igId, userInfo)
        await setPendingTwoStep(rule.id, commenterId, { keyword, triggerWord: 'yes' })
        await logWebhookEvent({ type: 'two_step_initiated', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentId, commentText, mediaId })
        console.log('[webhook] two-step initiated for rule:', rule.name)
      } else {
        await sendPrivateReply(commentId, messages, account.token, account.igId, userInfo)
        await logDM(rule.id, commenterId)
        await logWebhookEvent({ type: 'private_reply_sent', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentId, commentText, mediaId })
        console.log('[webhook] private reply sent!')
      }
    } catch (err) {
      await logWebhookEvent({ type: 'private_reply_failed', account: account.name, ruleId: rule.id, ruleName: rule.name, commentId, commentText, error: err.response?.data ?? err.message })
      console.error('[webhook] failed to send private reply for rule:', rule.name, err.response?.data ?? err.message)
      continue
    }

    try {
      const replyPool = rule.commentReplies?.length
        ? rule.commentReplies
        : rule.commentReply
          ? [rule.commentReply]
          : [DEFAULT_COMMENT_REPLY]
      const replyText = replyPool[Math.floor(Math.random() * replyPool.length)]
      await replyToComment(commentId, replyText, account.token)
      await logWebhookEvent({ type: 'comment_reply_sent', account: account.name, ruleId: rule.id, ruleName: rule.name, commentId, commentText })
      console.log('[webhook] comment reply sent!')
    } catch (err) {
      await logWebhookEvent({ type: 'comment_reply_failed', account: account.name, ruleId: rule.id, ruleName: rule.name, commentId, commentText, error: err.response?.data ?? err.message })
      console.error('[webhook] failed to reply to comment for rule:', rule.name, err.response?.data ?? err.message)
    }
  }
}
