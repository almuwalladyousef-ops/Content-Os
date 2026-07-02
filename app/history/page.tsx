'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { IconFilm, IconExternal, IconArrowRight, LogoYouTube, LogoInstagram, PlatformIcon } from '@/components/Icons'
import { PostRecord, VideoAnalysis } from '@/lib/types'

const PLATFORM_META = {
  youtube: { name: 'YouTube', color: 'oklch(0.65 0.21 25)' },
  instagram: { name: 'Instagram', color: 'oklch(0.70 0.20 340)' },
  tiktok: { name: 'TikTok', color: 'oklch(0.85 0.15 200)' },
} as const

type PlatformKey = keyof typeof PLATFORM_META
type Filter = 'all' | 'analyzed' | PlatformKey

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--bad)'
  const dim = score >= 75 ? 'oklch(0.78 0.16 155 / 0.12)' : score >= 50 ? 'oklch(0.82 0.15 80 / 0.12)' : 'oklch(0.70 0.19 25 / 0.12)'
  return (
    <div className="mono" style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 3,
      padding: '3px 8px', borderRadius: 6,
      background: dim, color,
      fontSize: 12, fontWeight: 600,
      border: `1px solid ${color}`,
      letterSpacing: '0.02em',
    }}>
      {score}<span style={{ fontSize: 9, opacity: 0.6 }}>/100</span>
    </div>
  )
}

// ── Hook meter (small) ────────────────────────────────────────────────────────
function HookMeter({ score = 0, size = 64 }: { score: number; size?: number }) {
  const color = score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--bad)'
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <div style={{ display: 'grid', placeItems: 'center', position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: size > 80 ? 18 : 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1 }}>
          {score}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, colorByScore }: {
  label: string
  value: string | number
  sub: string
  colorByScore?: boolean
}) {
  let color = 'var(--text)'
  if (colorByScore && typeof value === 'number') {
    color = value >= 75 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--bad)'
  }
  return (
    <div className="card" style={{ padding: 'var(--pad-sm)' }}>
      <div className="micro" style={{ marginBottom: 8 }}>{label}</div>
      <div className="mono" style={{ fontSize: 30, fontWeight: 500, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

// ── Filter pill ───────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick, count, icon, color }: {
  label: string
  active: boolean
  onClick: () => void
  count: number
  icon?: React.ReactNode
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 11px', borderRadius: 999,
        background: active ? 'var(--accent-dim)' : 'var(--surface-2)',
        border: '1px solid', borderColor: active ? 'oklch(0.72 0.16 255 / 0.4)' : 'var(--hairline)',
        color: active ? 'var(--text)' : 'var(--text-dim)',
        fontSize: 12, fontWeight: active ? 500 : 400,
        transition: 'all 120ms ease',
      }}
    >
      {icon && <span style={{ color: color || 'currentColor' }}>{icon}</span>}
      {label}
      <span className="mono" style={{
        fontSize: 10, opacity: 0.7, padding: '0 5px', borderRadius: 4,
        background: active ? 'oklch(0.72 0.16 255 / 0.2)' : 'var(--bg)',
      }}>{count}</span>
    </button>
  )
}

// ── History row ───────────────────────────────────────────────────────────────
function hookScoreFromAnalysis(analysis: VideoAnalysis): number {
  const s = analysis.hook.strength
  if (s === 'strong') return 82
  if (s === 'medium') return 58
  return 32
}

function HistoryRow({ entry, expanded, onToggle, analysis }: {
  entry: PostRecord
  expanded: boolean
  onToggle: () => void
  analysis?: VideoAnalysis
}) {
  const d = new Date(entry.date)
  const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <>
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '110px 1fr 130px 220px 140px 50px',
          padding: '14px 20px', alignItems: 'center', gap: 12,
          borderBottom: expanded ? '1px solid var(--accent-dim)' : '1px solid var(--hairline)',
          cursor: 'pointer',
          background: expanded ? 'var(--bg-2)' : 'transparent',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = 'oklch(0.185 0.013 255 / 0.5)' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{dateLabel}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>{time}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.video_name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {entry.platforms.map(p => {
            const meta = PLATFORM_META[p as PlatformKey]
            if (!meta) return null
            return (
              <div key={p} title={meta.name} style={{
                width: 26, height: 26, borderRadius: 7,
                background: `oklch(from ${meta.color} l c h / 0.15)`,
                color: meta.color,
                display: 'grid', placeItems: 'center',
                border: `1px solid oklch(from ${meta.color} l c h / 0.3)`,
              }}>
                <PlatformIcon platform={p} size={13} />
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.caption?.slice(0, 80) || '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          {analysis ? (
            <ScoreBadge score={hookScoreFromAnalysis(analysis)} />
          ) : entry.analysis_file_id ? (
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>loading…</span>
          ) : (
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>no analysis</span>
          )}
        </div>
        <div style={{ color: 'var(--text-mute)', textAlign: 'right' }}>
          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 180ms ease' }}>›</span>
        </div>
      </div>

      {expanded && (
        <div className="anim-up" style={{
          padding: 24,
          background: 'oklch(0.185 0.013 255 / 0.4)',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
            {/* Thumbnail + links */}
            <div>
              <div style={{
                aspectRatio: '9 / 16', maxWidth: 160, borderRadius: 12,
                background: 'linear-gradient(135deg, oklch(0.32 0.06 250), oklch(0.20 0.04 280))',
                border: '1px solid var(--border)', position: 'relative', marginBottom: 12,
              }}>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'oklch(1 0 0 / 0.4)' }}>
                  <IconFilm size={28} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entry.youtube_url && (
                  <a href={entry.youtube_url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <LogoYouTube size={12} /> YouTube <IconExternal size={10} style={{ marginLeft: 'auto' }} />
                  </a>
                )}
                {entry.instagram_url && (
                  <a href={entry.instagram_url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <LogoInstagram size={12} /> Instagram <IconExternal size={10} style={{ marginLeft: 'auto' }} />
                  </a>
                )}
              </div>
            </div>

            {/* Platform tiles + analysis */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                {entry.platforms.map(p => {
                  const meta = PLATFORM_META[p as PlatformKey]
                  if (!meta) return null
                  return (
                    <div key={p} style={{ padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ color: meta.color }}><PlatformIcon platform={p} size={12} /></span>
                        <span className="micro" style={{ color: 'var(--text-2)' }}>{meta.name}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>—</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>views</div>
                    </div>
                  )
                })}
              </div>
              {analysis && (
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <HookMeter score={hookScoreFromAnalysis(analysis)} size={64} />
                  <div style={{ flex: 1 }}>
                    <div className="micro" style={{ marginBottom: 4 }}>Hook strength</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                      {analysis.hook.assessment?.slice(0, 120) || 'Analysis available. View full report →'}
                    </div>
                  </div>
                  <button className="btn" style={{ flexShrink: 0 }}>
                    <IconArrowRight size={14} /> Open analysis
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [history, setHistory] = useState<PostRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<Record<string, VideoAnalysis>>({})

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => { setHistory(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleClear() {
    if (!confirm('Clear all history? This cannot be undone.')) return
    await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) })
    setHistory([])
  }

  async function handleToggle(entry: PostRecord) {
    if (expanded === entry.id) { setExpanded(null); return }
    setExpanded(entry.id)
    if (entry.analysis_file_id && !analyses[entry.id]) {
      const res = await fetch(`/api/drive/read?fileId=${entry.analysis_file_id}`)
      const data = await res.json()
      if (!data.error) setAnalyses(a => ({ ...a, [entry.id]: data }))
    }
  }

  const items = useMemo(() => {
    if (filter === 'all') return history
    if (filter === 'analyzed') return history.filter(h => !!h.analysis_file_id)
    return history.filter(h => h.platforms.includes(filter as 'youtube' | 'instagram' | 'tiktok'))
  }, [history, filter])

  const stats = useMemo(() => {
    const total = history.length
    const analyzed = history.filter(h => !!h.analysis_file_id).length
    const platforms = [...new Set(history.flatMap(h => h.platforms))].length
    return { total, analyzed, platforms }
  }, [history])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-mute)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="anim-up" style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>Past 30 days</div>
          <h1 className="h1">History</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost">Export CSV</button>
          <button className="btn" onClick={handleClear}>Clear history</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)' }}>
        <StatCard label="Total posts" value={stats.total} sub="all time" />
        <StatCard label="With analysis" value={stats.analyzed} sub={stats.total > 0 ? `${Math.round(stats.analyzed / stats.total * 100)}% covered` : '0% covered'} />
        <StatCard label="Platforms" value={stats.platforms} sub="unique platforms" />
        <StatCard label="Avg hook" value="—" sub="run analysis to see" />
      </div>

      {history.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
          color: 'var(--text-mute)', fontSize: 13,
        }}>
          No history yet
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <FilterPill label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={history.length} />
            <FilterPill label="Analyzed" active={filter === 'analyzed'} onClick={() => setFilter('analyzed')} count={history.filter(h => !!h.analysis_file_id).length} />
            <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            {(Object.entries(PLATFORM_META) as [PlatformKey, typeof PLATFORM_META[PlatformKey]][]).map(([id, meta]) => (
              <FilterPill
                key={id}
                label={meta.name}
                active={filter === id}
                onClick={() => setFilter(id)}
                count={history.filter(h => h.platforms.includes(id as 'youtube' | 'instagram' | 'tiktok')).length}
                icon={<PlatformIcon platform={id} size={12} />}
                color={meta.color}
              />
            ))}
          </div>

          {/* Table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 130px 220px 140px 50px',
              padding: '14px 20px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
              alignItems: 'center', gap: 12,
            }}>
              <span className="micro">Date</span>
              <span className="micro">Video</span>
              <span className="micro">Platforms</span>
              <span className="micro">Caption</span>
              <span className="micro" style={{ textAlign: 'right' }}>Score</span>
              <span />
            </div>

            {items.map(entry => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                expanded={expanded === entry.id}
                onToggle={() => handleToggle(entry)}
                analysis={analyses[entry.id]}
              />
            ))}

            {items.length === 0 && (
              <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-mute)' }}>
                No matches.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
