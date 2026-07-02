import axios from 'axios'
import { getAccountsWithStoredTokens } from '@/lib/dm/accounts'
import {
  getRules, hasBeenDMed, logDM, logWebhookEvent, checkAndIncrementSendCap,
  getPendingTwoStepForUser, setPendingTwoStep,
} from '@/lib/dm/driveDB'
import { fetchUserName, replyToComment, sendPrivateReply, sendPrivateReplyWithButton } from '@/lib/dm/instagram'

const FACEBOOK_BASE = 'https://graph.facebook.com/v21.0'
const INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0'
const DEFAULT_COMMENT_REPLY = 'Sent you a DM.'

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesKeywords(commentText, rule) {
  const lower = commentText.toLowerCase()
  if (rule.anyComment) return true
  if (!rule.keywords?.length) return false

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

function getMessagesForMatch(rule, commentText) {
  if (rule.perKeywordMessages && Object.keys(rule.perKeywordMessages).length > 0) {
    const lower = commentText.toLowerCase()
    for (const [kw, msgs] of Object.entries(rule.perKeywordMessages)) {
      if (lower.includes(kw.toLowerCase()) && msgs?.length) return { messages: msgs, keyword: kw }
    }
  }
  return { messages: rule.messages || [], keyword: null }
}

function isWithinSchedule(rule) {
  const now = new Date()
  if (rule.startDate && new Date(rule.startDate) > now) return false
  if (rule.endDate && new Date(rule.endDate) < now) return false
  return true
}

async function getInstagramLoginAccount(token) {
  const res = await axios.get(`${INSTAGRAM_BASE}/me`, {
    params: { fields: 'id,user_id,username,account_type', access_token: token },
  })
  return res.data
}

async function getRecentMediaWithComments(account, sinceMinutes) {
  const base = isInstagramLoginToken(account.token) ? INSTAGRAM_BASE : FACEBOOK_BASE
  const accountId = isInstagramLoginToken(account.token)
    ? (await getInstagramLoginAccount(account.token)).id
    : account.igId

  const res = await axios.get(`${base}/${accountId}/media`, {
    params: {
      fields: 'id,comments.limit(25){id,text,from,timestamp}',
      limit: 10,
      access_token: account.token,
    },
  })

  const cutoff = Date.now() - sinceMinutes * 60 * 1000
  const comments = []
  for (const media of res.data.data || []) {
    for (const comment of media.comments?.data || []) {
      if (comment.timestamp && new Date(comment.timestamp).getTime() < cutoff) continue
      comments.push({
        mediaId: media.id,
        commentId: comment.id,
        commentText: comment.text || '',
        commenterId: comment.from?.id,
        timestamp: comment.timestamp,
      })
    }
  }
  return comments
}

async function processPolledComment(account, rules, comment) {
  const { mediaId, commentId, commentText, commenterId, timestamp } = comment
  if (!commentId || !commenterId || !commentText) return

  for (const rule of rules) {
    if (!rule.active) continue
    if (rule.igId && rule.igId !== account.igId) continue
    if (!isWithinSchedule(rule)) continue
    if (!(rule.applyToAll || rule.targetReels?.includes(mediaId))) continue

    if (!matchesKeywords(commentText, rule)) {
      await logWebhookEvent({ type: 'poll_skipped_no_keyword_match', account: account.name, ruleId: rule.id, ruleName: rule.name, keywords: rule.keywords, commentText, mediaId, commentId })
      continue
    }

    const alreadyDMed = await hasBeenDMed(rule.id, commenterId, rule.retriggerDays ?? null)
    if (alreadyDMed) {
      await logWebhookEvent({ type: 'poll_skipped_already_dmed', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentText, mediaId, commentId })
      continue
    }

    const withinCap = await checkAndIncrementSendCap(rule.id, rule.sendCap || null)
    if (!withinCap) {
      await logWebhookEvent({ type: 'poll_skipped_send_cap', account: account.name, ruleId: rule.id, ruleName: rule.name })
      continue
    }

    const userInfo = await fetchUserName(commenterId, account.token).catch(() => ({ name: '', username: '' }))
    const { messages, keyword } = getMessagesForMatch(rule, commentText)

    try {
      if (rule.twoStep) {
        const pending = await getPendingTwoStepForUser(commenterId)
        if (pending?.ruleId === rule.id) {
          await logWebhookEvent({ type: 'poll_skipped_two_step_already_pending', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentText, mediaId, commentId })
          continue
        }

        const prompt = rule.twoStepPrompt || 'Want me to send the link?'
        const btnText = rule.twoStepButtonText || 'Send It In 5 min!'
        await sendPrivateReplyWithButton(commentId, prompt, btnText, account.token, account.igId, userInfo)
        await setPendingTwoStep(rule.id, commenterId, { keyword, triggerWord: 'yes' })
        await logWebhookEvent({ type: 'poll_two_step_initiated', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentId, commentText, mediaId, timestamp })
      } else {
        await sendPrivateReply(commentId, messages, account.token, account.igId, userInfo)
        await logDM(rule.id, commenterId)
        await logWebhookEvent({ type: 'poll_private_reply_sent', account: account.name, ruleId: rule.id, ruleName: rule.name, commenterId, commentId, commentText, mediaId, timestamp })
      }
    } catch (err) {
      await logWebhookEvent({ type: 'poll_private_reply_failed', account: account.name, ruleId: rule.id, ruleName: rule.name, commentId, commentText, error: err.response?.data ?? err.message })
      continue
    }

    try {
      await replyToComment(commentId, rule.commentReply || DEFAULT_COMMENT_REPLY, account.token)
      await logWebhookEvent({ type: 'poll_comment_reply_sent', account: account.name, ruleId: rule.id, ruleName: rule.name, commentId, commentText })
    } catch (err) {
      await logWebhookEvent({ type: 'poll_comment_reply_failed', account: account.name, ruleId: rule.id, ruleName: rule.name, commentId, commentText, error: err.response?.data ?? err.message })
    }
  }
}

export async function GET(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  const cronHeader = req.headers.get('x-vercel-cron')
  const userAgent = req.headers.get('user-agent') || ''
  const { searchParams } = new URL(req.url)
  const sinceMinutes = Number(searchParams.get('sinceMinutes') || 15)

  if (process.env.CRON_SECRET && auth !== process.env.CRON_SECRET && cronHeader !== '1' && !userAgent.includes('vercel-cron')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await getAccountsWithStoredTokens()
  const rules = await getRules()
  const results = []

  for (const account of accounts) {
    try {
      const comments = await getRecentMediaWithComments(account, sinceMinutes)
      for (const comment of comments) {
        await processPolledComment(account, rules, comment)
      }
      results.push({ account: account.name, comments: comments.length })
    } catch (err) {
      const error = err.response?.data ?? err.message
      await logWebhookEvent({ type: 'poll_account_failed', account: account.name, error })
      results.push({ account: account.name, error })
    }
  }

  return Response.json({ success: true, sinceMinutes, results })
}
