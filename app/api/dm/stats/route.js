import { NextResponse } from 'next/server'
import { getStats, getRules, getPerRuleStats, get7DayStats, getTokenStatus } from '@/lib/dm/driveDB'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const igId = searchParams.get('igId')
  const includePerRule = searchParams.get('perRule') === '1'

  const [stats, rules, perRule, tokenStatus] = await Promise.all([
    getStats(),
    getRules(),
    getPerRuleStats(),
    getTokenStatus(),
  ])

  const filtered = igId ? rules.filter(r => r.igId === igId) : rules
  const daily = await get7DayStats(igId ? filtered.map(r => r.id) : null)

  const response = {
    totalDMs: igId
      ? filtered.reduce((sum, r) => sum + (perRule[r.id]?.count || 0), 0)
      : stats.totalDMs,
    totalRules: filtered.length,
    activeRules: filtered.filter(r => r.active).length,
    daily7Day: daily,
    tokenStatus,
  }

  if (includePerRule) {
    response.perRule = perRule
  }

  return NextResponse.json(response)
}
