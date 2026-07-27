import { NextResponse } from 'next/server'
import { getStats, getRules, getPerRuleStats, get7DayStats, getTokenStatus, getFunnelStats } from '@/lib/dm/driveDB'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const igId = searchParams.get('igId')
  const includePerRule = searchParams.get('perRule') === '1'

  const [stats, rules, perRule, tokenStatus, funnel] = await Promise.all([
    getStats(),
    getRules(),
    getPerRuleStats(),
    getTokenStatus(),
    getFunnelStats(),
  ])

  const filtered = igId ? rules.filter(r => r.igId === igId) : rules
  const daily = await get7DayStats(igId ? filtered.map(r => r.id) : null)

  // When scoped to one account, roll the funnel up from that account's rules only.
  const scopedRuleIds = igId ? new Set(filtered.map(r => r.id)) : null
  const scopedPerRule = scopedRuleIds
    ? Object.fromEntries(Object.entries(funnel.perRule).filter(([id]) => scopedRuleIds.has(id)))
    : funnel.perRule
  const totals = scopedRuleIds
    ? Object.values(scopedPerRule).reduce(
        (acc, r) => ({ asked: acc.asked + (r.asked || 0), sent: acc.sent + (r.sent || 0), failed: acc.failed + (r.failed || 0) }),
        { asked: 0, sent: 0, failed: 0 }
      )
    : funnel.totals

  const response = {
    totalDMs: igId
      ? filtered.reduce((sum, r) => sum + (perRule[r.id]?.count || 0), 0)
      : stats.totalDMs,
    totalRules: filtered.length,
    activeRules: filtered.filter(r => r.active).length,
    daily7Day: daily,
    tokenStatus,
    funnel: {
      totals,
      daily: funnel.daily,
      perRule: scopedPerRule,
      recent: scopedRuleIds
        ? funnel.recent.filter(e => !e.ruleId || scopedRuleIds.has(e.ruleId))
        : funnel.recent,
    },
  }

  if (includePerRule) {
    response.perRule = perRule
  }

  return NextResponse.json(response)
}
