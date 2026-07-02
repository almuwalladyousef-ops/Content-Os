'use client'
import Link from 'next/link'

export function relativeTime(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function RuleCard({
  rule,
  account,
  ruleStats,       // { count, lastAt }
  isSelected,
  onToggleSelect,
  onToggleActive,
  compact = false,
}) {
  const dmCount = ruleStats?.count || 0
  const lastAt = ruleStats?.lastAt || null
  const firstMsg = rule.messages?.find(m => m.type === 'text')?.content

  function handleActiveToggle(e) {
    e.preventDefault()
    e.stopPropagation()
    onToggleActive?.(rule.id, !rule.active)
  }

  return (
    <div
      className={`rule-card ${isSelected ? 'rule-card--selected' : ''}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          className="rule-card__checkbox"
          checked={!!isSelected}
          onChange={e => { e.stopPropagation(); onToggleSelect(rule.id) }}
          onClick={e => e.stopPropagation()}
        />
      )}

      <Link
        href={`/dm/rules/${rule.id}`}
        className="rule-card__link"
      >
        <div className="rule-card__left">
          <div className="rule-card__top-row">
            <span className="rule-name">{rule.name}</span>
            {rule.twoStep && <span className="rule-badge rule-badge--twostep">2-step</span>}
            {rule.anyComment && <span className="rule-badge rule-badge--any">Any comment</span>}
          </div>

          <div className="rule-keywords">
            {rule.anyComment
              ? 'Triggers on all comments'
              : rule.keywords.join(', ') || '—'
            }
          </div>

          {firstMsg && !compact && (
            <div className="rule-msg-preview">
              {firstMsg.length > 60 ? firstMsg.slice(0, 60) + '…' : firstMsg}
            </div>
          )}

          <div className="rule-card__meta-row">
            {account && <span className="rule-account">{account.name}</span>}
            {dmCount > 0 && (
              <span className="rule-meta-chip">
                {dmCount} DM{dmCount !== 1 ? 's' : ''} sent
              </span>
            )}
            {lastAt && (
              <span className="rule-meta-chip" title={new Date(lastAt).toLocaleString()}>
                Last fired {relativeTime(lastAt)}
              </span>
            )}
            {!compact && rule.createdAt && (
              <span className="rule-meta-chip" title={new Date(rule.createdAt).toLocaleString()}>
                Created {relativeTime(rule.createdAt)}
              </span>
            )}
          </div>
        </div>

        <div className="rule-card__right">
          <button
            className={`active-toggle ${rule.active ? 'active-toggle--on' : 'active-toggle--off'}`}
            onClick={handleActiveToggle}
            title={rule.active ? 'Click to pause' : 'Click to activate'}
          >
            {rule.active ? 'Active' : 'Paused'}
          </button>
          <span className="rule-meta">
            {rule.applyToAll ? 'All reels' : `${rule.targetReels?.length || 0} reel${(rule.targetReels?.length || 0) !== 1 ? 's' : ''}`}
          </span>
          {rule.messages?.length > 0 && (
            <span className="rule-meta">
              {rule.messages.length} block{rule.messages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Link>
    </div>
  )
}

export function RuleCardSkeleton() {
  return (
    <div className="rule-card rule-card--skeleton">
      <div className="skeleton skeleton--name" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line skeleton--short" />
    </div>
  )
}
