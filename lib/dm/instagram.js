import axios from 'axios'
import { getAccountsWithStoredTokens } from './accounts.js'

const FACEBOOK_BASE = 'https://graph.facebook.com/v21.0'
const INSTAGRAM_BASE = 'https://graph.instagram.com/v21.0'
const instagramLoginAccountCache = new Map()
const userNameCache = new Map()

function isInstagramLoginToken(token) {
  return token?.startsWith('IGA')
}

async function getInstagramLoginAccount(token) {
  if (instagramLoginAccountCache.has(token)) {
    return instagramLoginAccountCache.get(token)
  }
  const res = await axios.get(`${INSTAGRAM_BASE}/me`, {
    params: { fields: 'id,user_id,username,account_type', access_token: token },
  })
  instagramLoginAccountCache.set(token, res.data)
  return res.data
}

// Fetch commenter's name for {{first_name}} / {{username}} tokens
export async function fetchUserName(userId, token) {
  if (userNameCache.has(userId)) return userNameCache.get(userId)
  try {
    const base = isInstagramLoginToken(token) ? INSTAGRAM_BASE : FACEBOOK_BASE
    const res = await axios.get(`${base}/${userId}`, {
      params: { fields: 'name,username', access_token: token },
    })
    const data = { name: res.data.name || '', username: res.data.username || '' }
    userNameCache.set(userId, data)
    return data
  } catch {
    return { name: '', username: '' }
  }
}

export function resolvePersonalization(text, userInfo) {
  if (!text) return text
  const first = (userInfo?.name || '').split(' ')[0] || ''
  return text
    .replace(/\{\{first_name\}\}/gi, first)
    .replace(/\{\{name\}\}/gi, userInfo?.name || '')
    .replace(/\{\{username\}\}/gi, userInfo?.username ? `@${userInfo.username}` : '')
}

function messageToText(msg, userInfo) {
  const raw = msg.type === 'text' ? msg.content?.trim() : msg.url?.trim()
  return resolvePersonalization(raw, userInfo)
}

function buildPrivateReplyText(messages, userInfo) {
  return messages
    .map(m => messageToText(m, userInfo))
    .filter(Boolean)
    .join('\n\n')
}

function buildMessagePayload(messages, userInfo) {
  const buttonBlocks = messages
    .filter(m => m.type === 'button' && m.label?.trim() && m.url?.trim())
    .slice(0, 3)

  if (!buttonBlocks.length) {
    return { text: buildPrivateReplyText(messages, userInfo) }
  }

  const text = messages
    .filter(m => m.type !== 'button')
    .map(m => messageToText(m, userInfo))
    .filter(Boolean)
    .join('\n\n')

  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: text || 'Here you go:',
        buttons: buttonBlocks.map(button => ({
          type: 'web_url',
          title: resolvePersonalization(button.label.trim(), userInfo).slice(0, 20),
          url: button.url.trim(),
        })),
      },
    },
  }
}

// Send a single text DM (private reply to a comment)
export async function sendPrivateReply(commentId, messages, token, igId, userInfo) {
  const message = buildMessagePayload(messages, userInfo)
  if (!commentId || (!message.text && !message.attachment)) {
    throw new Error('Cannot send private reply without a comment ID and message text')
  }

  if (isInstagramLoginToken(token)) {
    const account = await getInstagramLoginAccount(token)
    await axios.post(
      `${INSTAGRAM_BASE}/${account.id}/messages`,
      { recipient: { comment_id: commentId }, message },
      { params: { access_token: token } }
    )
    return
  }

  await axios.post(
    `${FACEBOOK_BASE}/${igId}/messages`,
    { recipient: { comment_id: commentId }, message },
    { params: { access_token: token } }
  )
}

// Send a DM with a quick-reply button (two-step opt-in step 1)
export async function sendPrivateReplyWithButton(commentId, promptText, buttonText, token, igId, userInfo) {
  const text = resolvePersonalization(promptText, userInfo)
  const payload = {
    recipient: { comment_id: commentId },
    message: {
      text,
      quick_replies: [
        { content_type: 'text', title: buttonText || 'Send It In 5 min!', payload: 'TRIGGER_STEP2' },
      ],
    },
  }

  if (isInstagramLoginToken(token)) {
    const account = await getInstagramLoginAccount(token)
    await axios.post(`${INSTAGRAM_BASE}/${account.id}/messages`, payload, {
      params: { access_token: token },
    })
    return
  }

  await axios.post(`${FACEBOOK_BASE}/${igId}/messages`, payload, {
    params: { access_token: token },
  })
}

// Send a follow-up DM directly to a user ID (step 2 of two-step, or DM keyword reply)
export async function sendDMToUser(userId, messages, token, igId, userInfo) {
  const message = buildMessagePayload(messages, userInfo)
  if (!userId || (!message.text && !message.attachment)) throw new Error('Cannot send DM without userId and text')

  const payload = { recipient: { id: userId }, message }

  if (isInstagramLoginToken(token)) {
    const account = await getInstagramLoginAccount(token)
    await axios.post(`${INSTAGRAM_BASE}/${account.id}/messages`, payload, {
      params: { access_token: token },
    })
    return
  }

  await axios.post(`${FACEBOOK_BASE}/${igId}/messages`, payload, {
    params: { access_token: token },
  })
}

export async function replyToComment(commentId, message, token) {
  const text = message?.trim()
  if (!commentId || !text) return

  const body = new URLSearchParams({ message: text }).toString()
  const config = {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    params: { access_token: token },
  }
  const bases = isInstagramLoginToken(token)
    ? [INSTAGRAM_BASE, FACEBOOK_BASE]
    : [FACEBOOK_BASE, INSTAGRAM_BASE]

  let lastError
  for (const base of bases) {
    try {
      await axios.post(`${base}/${commentId}/replies`, body, config)
      return
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

export async function getReels() {
  const accounts = await getAccountsWithStoredTokens()
  const results = []

  for (const account of accounts) {
    try {
      const base = isInstagramLoginToken(account.token) ? INSTAGRAM_BASE : FACEBOOK_BASE
      const accountId = isInstagramLoginToken(account.token)
        ? (await getInstagramLoginAccount(account.token)).id
        : account.igId

      const res = await axios.get(`${base}/${accountId}/media`, {
        params: {
          fields: 'id,caption,media_type,thumbnail_url,permalink,timestamp',
          access_token: account.token,
        },
      })

      const reels = (res.data.data || [])
        .filter(m => m.media_type === 'VIDEO' || m.media_type === 'REEL')
        .map(r => ({ ...r, accountName: account.name, igId: account.igId }))

      results.push(...reels)
    } catch {
      // Skip accounts with errors
    }
  }

  return results
}
