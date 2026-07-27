import { randomUUID } from 'crypto'
import { readDoc, writeDoc } from '@/lib/drive-db'

// TriggerDM's state now lives in the shared Drive JSON-DB (section `dm`) rather
// than a bespoke db.json. All reads/writes go through lib/drive-db.ts so the
// whole suite shares one Drive implementation + dev fallback.
const SECTION = 'dm'
const DEFAULT_DB = {
  rules: [], workspaces: [], dmedLog: {}, tokenLog: [],
  twoStepPending: {}, sendCapLog: {}, storedTokens: {},
}

export async function readDB() {
  const doc = await readDoc(SECTION)
  return doc || { ...DEFAULT_DB }
}

export async function writeDB(data) {
  await writeDoc(SECTION, data)
}

export async function getRules() {
  const db = await readDB()
  return db.rules || []
}

export async function saveRule(rule) {
  const db = await readDB()
  const now = new Date().toISOString()
  const withTimestamp = { ...rule, updatedAt: now }
  const idx = (db.rules || []).findIndex(r => r.id === rule.id)
  if (idx >= 0) {
    db.rules[idx] = withTimestamp
  } else {
    db.rules = [...(db.rules || []), withTimestamp]
  }
  await writeDB(db)
  return withTimestamp
}

export async function deleteRule(id) {
  const db = await readDB()
  db.rules = (db.rules || []).filter(r => r.id !== id)
  if (db.dmedLog) {
    for (const key of Object.keys(db.dmedLog)) {
      if (key.startsWith(`${id}:`)) delete db.dmedLog[key]
    }
  }
  if (db.twoStepPending) {
    for (const key of Object.keys(db.twoStepPending)) {
      if (key.startsWith(`${id}:`)) delete db.twoStepPending[key]
    }
  }
  await writeDB(db)
}

export async function deleteRules(ids) {
  const idSet = new Set(ids)
  const db = await readDB()
  db.rules = (db.rules || []).filter(r => !idSet.has(r.id))
  if (db.dmedLog) {
    for (const key of Object.keys(db.dmedLog)) {
      if (idSet.has(key.split(':')[0])) delete db.dmedLog[key]
    }
  }
  await writeDB(db)
}

export async function bulkUpdateRules(ids, fields) {
  const idSet = new Set(ids)
  const db = await readDB()
  const now = new Date().toISOString()
  db.rules = (db.rules || []).map(r =>
    idSet.has(r.id) ? { ...r, ...fields, updatedAt: now } : r
  )
  await writeDB(db)
}

export async function resetRuleDmedLog(ruleId) {
  const db = await readDB()
  if (db.dmedLog) {
    for (const key of Object.keys(db.dmedLog)) {
      if (key.startsWith(`${ruleId}:`)) delete db.dmedLog[key]
    }
  }
  await writeDB(db)
}

export async function hasBeenDMed(ruleId, userId, retriggerDays = null) {
  const db = await readDB()
  const key = `${ruleId}:${userId}`
  const ts = db.dmedLog?.[key]
  if (!ts) return false
  if (retriggerDays != null) {
    const daysSince = (Date.now() - new Date(ts).getTime()) / 86400000
    return daysSince < retriggerDays
  }
  return true
}

export async function logDM(ruleId, userId) {
  const db = await readDB()
  db.dmedLog = db.dmedLog || {}
  db.dmedLog[`${ruleId}:${userId}`] = new Date().toISOString()
  await writeDB(db)
}

export async function logToken(token, expiryDate) {
  const db = await readDB()
  db.tokenLog = db.tokenLog || []
  db.tokenLog.push({ token, expiryDate, refreshedAt: new Date().toISOString() })
  await writeDB(db)
}

export async function saveStoredToken(key, token, meta = {}) {
  const db = await readDB()
  db.storedTokens = db.storedTokens || {}
  db.storedTokens[key] = {
    token,
    meta,
    updatedAt: new Date().toISOString(),
  }
  await writeDB(db)
}

export async function getStoredToken(key) {
  const db = await readDB()
  return db.storedTokens?.[key]?.token || null
}

export async function getStoredTokenRecord(key) {
  const db = await readDB()
  return db.storedTokens?.[key] || null
}

export async function savePendingMetaSelection(data) {
  const db = await readDB()
  const id = randomUUID()
  db.pendingMetaSelections = db.pendingMetaSelections || {}
  db.pendingMetaSelections[id] = {
    ...data,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
  await writeDB(db)
  return id
}

export async function consumePendingMetaSelection(id) {
  const db = await readDB()
  const pending = db.pendingMetaSelections?.[id] || null
  if (db.pendingMetaSelections) delete db.pendingMetaSelections[id]
  await writeDB(db)

  if (!pending) return null
  if (pending.expiresAt && new Date(pending.expiresAt).getTime() < Date.now()) return null
  return pending
}

// Two-step opt-in: store pending state until user taps button / replies.
//
// A pending entry that nobody ever taps used to live forever AND block that
// user from re-triggering the rule, so one un-tapped prompt disabled the rule
// for that person permanently. Entries now age out.
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000      // Instagram's messaging window
export const PENDING_REPROMPT_AFTER_MS = 30 * 60 * 1000 // re-prompt a repeat commenter after this

export function pendingAgeMs(pending) {
  if (!pending?.createdAt) return Infinity
  return Date.now() - new Date(pending.createdAt).getTime()
}

function prunePending(db) {
  if (!db.twoStepPending) return
  for (const [key, val] of Object.entries(db.twoStepPending)) {
    if (pendingAgeMs(val) > PENDING_TTL_MS) delete db.twoStepPending[key]
  }
}

export async function setPendingTwoStep(ruleId, userId, data) {
  const db = await readDB()
  db.twoStepPending = db.twoStepPending || {}
  prunePending(db)
  db.twoStepPending[`${ruleId}:${userId}`] = { ...data, createdAt: new Date().toISOString() }
  await writeDB(db)
}

export async function getPendingTwoStepForUser(userId) {
  const db = await readDB()
  const pending = db.twoStepPending || {}
  for (const [key, val] of Object.entries(pending)) {
    if (!key.endsWith(`:${userId}`)) continue
    if (pendingAgeMs(val) > PENDING_TTL_MS) continue // expired: treat as absent
    return { key, ruleId: key.split(':')[0], ...val }
  }
  return null
}

export async function clearPendingTwoStepForUsers(userIds = null) {
  const db = await readDB()
  const before = Object.keys(db.twoStepPending || {}).length
  if (!userIds) {
    db.twoStepPending = {}
  } else {
    const ids = new Set(userIds)
    for (const key of Object.keys(db.twoStepPending || {})) {
      if (ids.has(key.slice(key.indexOf(':') + 1))) delete db.twoStepPending[key]
    }
  }
  await writeDB(db)
  return { before, after: Object.keys(db.twoStepPending || {}).length }
}

export async function clearPendingTwoStep(ruleId, userId) {
  const db = await readDB()
  if (db.twoStepPending) delete db.twoStepPending[`${ruleId}:${userId}`]
  await writeDB(db)
}

// Send cap: check and increment daily DM count per rule
export async function checkAndIncrementSendCap(ruleId, cap) {
  if (!cap) return true
  const db = await readDB()
  db.sendCapLog = db.sendCapLog || {}
  const today = new Date().toISOString().slice(0, 10)
  const key = `${ruleId}:${today}`
  const count = db.sendCapLog[key] || 0
  if (count >= cap) return false
  db.sendCapLog[key] = count + 1
  await writeDB(db)
  return true
}

export async function getStats() {
  const db = await readDB()
  return {
    totalRules: (db.rules || []).length,
    activeRules: (db.rules || []).filter(r => r.active).length,
    totalDMs: Object.keys(db.dmedLog || {}).length,
  }
}

export async function getPerRuleStats() {
  const db = await readDB()
  const perRule = {}
  for (const [key, ts] of Object.entries(db.dmedLog || {})) {
    const ruleId = key.split(':')[0]
    if (!perRule[ruleId]) perRule[ruleId] = { count: 0, lastAt: null }
    perRule[ruleId].count++
    if (!perRule[ruleId].lastAt || ts > perRule[ruleId].lastAt) {
      perRule[ruleId].lastAt = ts
    }
  }
  return perRule
}

export async function get7DayStats(ruleIds = null) {
  const db = await readDB()
  const ruleIdSet = ruleIds ? new Set(ruleIds) : null
  const daily = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    daily[d] = 0
  }
  const cutoff = Object.keys(daily)[0]
  for (const [key, ts] of Object.entries(db.dmedLog || {})) {
    if (ruleIdSet && !ruleIdSet.has(key.split(':')[0])) continue
    if (ts >= cutoff) {
      const day = ts.slice(0, 10)
      if (day in daily) daily[day]++
    }
  }
  return daily
}

export async function getTokenStatus() {
  const db = await readDB()
  const log = db.tokenLog || []
  if (!log.length) return null
  const latest = log[log.length - 1]
  return {
    expiryDate: latest.expiryDate,
    refreshedAt: latest.refreshedAt,
    daysUntilExpiry: latest.expiryDate
      ? Math.ceil((new Date(latest.expiryDate) - Date.now()) / 86400000)
      : null,
  }
}

// ── Funnel ───────────────────────────────────────────────────────────────────
// The webhook log is capped at 200 entries and gets flooded by Instagram's
// delivery/echo noise, so it can't answer "how many people tapped the button".
// These counters are derived from the same events but never expire, and they
// piggyback on the webhook-log write so no extra Drive round-trip is added.
const FUNNEL_STAGE_BY_EVENT = {
  two_step_initiated: 'asked',
  poll_two_step_initiated: 'asked',
  two_step_completed: 'sent',
  dm_keyword_triggered: 'sent',
  two_step_failed: 'failed',
  private_reply_failed: 'failed',
  poll_private_reply_failed: 'failed',
  dm_keyword_failed: 'failed',
}

const EMPTY_FUNNEL = { totals: { asked: 0, sent: 0, failed: 0 }, perRule: {}, daily: {}, recent: [] }

function applyFunnelEvent(db, event, at) {
  const stage = FUNNEL_STAGE_BY_EVENT[event.type]
  if (!stage) return

  const funnel = db.funnel || (db.funnel = { ...EMPTY_FUNNEL })
  funnel.totals = funnel.totals || { asked: 0, sent: 0, failed: 0 }
  funnel.perRule = funnel.perRule || {}
  funnel.daily = funnel.daily || {}
  funnel.recent = funnel.recent || []

  funnel.totals[stage] = (funnel.totals[stage] || 0) + 1

  const ruleId = event.ruleId
  if (ruleId) {
    const rule = funnel.perRule[ruleId] || (funnel.perRule[ruleId] = { asked: 0, sent: 0, failed: 0 })
    rule[stage] = (rule[stage] || 0) + 1
    if (event.ruleName) rule.name = event.ruleName
    if (stage === 'asked') rule.lastAskedAt = at
    if (stage === 'sent') rule.lastSentAt = at
  }

  const day = at.slice(0, 10)
  const bucket = funnel.daily[day] || (funnel.daily[day] = { asked: 0, sent: 0, failed: 0 })
  bucket[stage] = (bucket[stage] || 0) + 1
  // Keep ~90 days of history; the counters above stay for all time.
  const days = Object.keys(funnel.daily).sort()
  if (days.length > 90) {
    for (const old of days.slice(0, days.length - 90)) delete funnel.daily[old]
  }

  funnel.recent.unshift({
    at,
    stage,
    ruleId: ruleId || null,
    ruleName: event.ruleName || null,
    userId: event.senderId || event.commenterId || null,
    username: event.username || null,
    error: stage === 'failed' ? String(event.error?.error?.message ?? event.error ?? '').slice(0, 160) : undefined,
  })
  if (funnel.recent.length > 50) funnel.recent = funnel.recent.slice(0, 50)
}

export async function logWebhookEvent(event) {
  const at = new Date().toISOString()
  const db = await readDB()
  db.webhookLog = db.webhookLog || []
  db.webhookLog.unshift({ ...event, at })
  if (db.webhookLog.length > 200) db.webhookLog = db.webhookLog.slice(0, 200)
  applyFunnelEvent(db, event, at)
  await writeDB(db)
}

export async function getWebhookLog() {
  const db = await readDB()
  return db.webhookLog || []
}

export async function getFunnelStats() {
  const db = await readDB()
  const funnel = db.funnel || EMPTY_FUNNEL
  return {
    totals: { asked: 0, sent: 0, failed: 0, ...funnel.totals },
    perRule: funnel.perRule || {},
    daily: funnel.daily || {},
    recent: funnel.recent || [],
  }
}

export async function getPendingTwoStepList() {
  const db = await readDB()
  return Object.entries(db.twoStepPending || {}).map(([key, val]) => ({
    ruleId: key.split(':')[0],
    userId: key.slice(key.indexOf(':') + 1),
    ...val,
  }))
}
