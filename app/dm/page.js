'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import RuleCard from '@/components/dm/RuleCard'
import useActiveWorkspace from '@/components/dm/useActiveWorkspace'

export default function Dashboard() {
  const { workspaces, activeWorkspace, loadingWorkspaces } = useActiveWorkspace()
  const [rules, setRules] = useState([])
  const [stats, setStats] = useState({ totalDMs: 0, activeRules: 0, totalRules: 0, daily7Day: {}, tokenStatus: null })
  const [perRuleStats, setPerRuleStats] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dm/rules').then(r => r.json()).then(rls => {
      setRules(rls)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!activeWorkspace) return
    if (!activeWorkspace.igId) {
      setStats({ totalDMs: 0, activeRules: 0, totalRules: 0, daily7Day: {}, tokenStatus: null })
      setPerRuleStats({})
      return
    }
    const url = `/api/dm/stats?igId=${activeWorkspace.igId}&perRule=1`
    fetch(url).then(r => r.json()).then(st => {
      setStats(st)
      setPerRuleStats(st.perRule || {})
    }).catch(() => {})
  }, [activeWorkspace?.id, activeWorkspace?.igId])

  const activeRules = (activeWorkspace
    ? rules.filter(r => r.workspaceId === activeWorkspace.id || (!r.workspaceId && r.igId === activeWorkspace.igId))
    : [])
    .filter(r => r.active)

  const daily = stats.daily7Day || {}
  const dailyKeys = Object.keys(daily).sort()
  const maxDaily = Math.max(...Object.values(daily), 1)

  const token = stats.tokenStatus
  const tokenExpiringSoon = token?.daysUntilExpiry != null && token.daysUntilExpiry <= 14

  return (
    <div className="page">
      {tokenExpiringSoon && (
        <div className={`token-banner ${token.daysUntilExpiry <= 3 ? 'token-banner--danger' : 'token-banner--warn'}`}>
          {token.daysUntilExpiry <= 0
            ? '🔴 Your Instagram access token has expired. Automations are paused until you refresh it.'
            : `⚠️ Your Instagram access token expires in ${token.daysUntilExpiry} day${token.daysUntilExpiry !== 1 ? 's' : ''}. Refresh it before it expires.`}
        </div>
      )}

      <div className="page-header">
        <h1>Dashboard</h1>
        <Link href="/dm/rules/new" className="btn-primary">+ New Rule</Link>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <p className="stat-number">{stats.totalDMs}</p>
          <p className="stat-label">Total DMs Sent</p>
        </div>
        <div className="stat-card">
          <p className="stat-number">{stats.activeRules}</p>
          <p className="stat-label">Active Rules</p>
        </div>
        <div className="stat-card">
          <p className="stat-number">{stats.totalRules}</p>
          <p className="stat-label">Total Rules</p>
        </div>
      </div>

      {/* 7-day chart */}
      {dailyKeys.length > 0 && (
        <div className="daily-chart-card">
          <h2>DMs sent — last 7 days</h2>
          <div className="daily-chart">
            {dailyKeys.map(day => {
              const count = daily[day] || 0
              const pct = Math.round((count / maxDaily) * 100)
              return (
                <div key={day} className="daily-bar-col">
                  <span className="daily-bar-count">{count > 0 ? count : ''}</span>
                  <div className="daily-bar-track">
                    <div className="daily-bar-fill" style={{ height: `${pct}%` }} />
                  </div>
                  <span className="daily-bar-label">
                    {new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <h2>Active Rules</h2>
      {loading || loadingWorkspaces ? (
        <p className="loading">Loading…</p>
      ) : activeRules.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🤖</div>
          <p className="empty-state__title">No active rules</p>
          <p className="empty-state__sub">Create a rule to start sending automatic DMs when people comment on your reels.</p>
          <Link href="/dm/rules/new" className="btn-primary">Create your first rule →</Link>
        </div>
      ) : (
        <div className="rule-list">
          {activeRules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              account={workspaces.find(w => w.id === rule.workspaceId) || workspaces.find(w => w.igId === rule.igId)}
              ruleStats={perRuleStats[rule.id]}
              compact
            />
          ))}
        </div>
      )}
    </div>
  )
}
