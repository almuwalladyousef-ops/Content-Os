'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  IconPost, IconMessage, IconLink, IconHeadphones,
  IconExternal, IconClock, IconArrowRight,
} from '@/components/Icons'

interface Status {
  youtube: { email: string } | null
  instagram: { username: string | null } | null
  tiktok: { displayName: string | null } | null
}
interface Job {
  id: string
  scheduledAt: string
  status: string
  platforms: Record<string, boolean>
  fileName: string
  caption?: string
}
interface FunnelEvent {
  at: string
  stage: 'asked' | 'sent' | 'failed'
  ruleName: string | null
  username: string | null
  userId: string | null
  error?: string
}
interface DmStats {
  totalDMs: number
  totalRules: number
  activeRules: number
  funnel?: {
    totals: { asked: number; sent: number; failed: number }
    recent: FunnelEvent[]
  }
}
interface HomeHealth {
  online: boolean
  configured: boolean
  checkedAt?: string
  latencyMs?: number
  serverTime?: string | null
  error?: string | null
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(diff / 86400000)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

const STAGE_LABEL: Record<FunnelEvent['stage'], string> = {
  asked: 'asked — button sent',
  sent: 'tapped — DM delivered',
  failed: 'failed',
}
const STAGE_COLOR: Record<FunnelEvent['stage'], string> = {
  asked: 'var(--warn)',
  sent: 'var(--ok)',
  failed: 'var(--bad)',
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 'var(--pad-sm)',
}

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [dm, setDm] = useState<DmStats | null>(null)
  const [home, setHome] = useState<HomeHealth | null>(null)

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setStatus).catch(() => {})
    fetch('/api/schedule').then(r => r.json()).then(d => setJobs(d.jobs ?? [])).catch(() => setJobs([]))

    // DM funnel and home-server health both change while you watch, so keep
    // them live instead of only reflecting the moment the page was opened.
    const loadDm = () => fetch('/api/dm/stats').then(r => r.json()).then(setDm).catch(() => {})
    const loadHome = () => fetch('/api/home/health').then(r => r.json()).then(setHome)
      .catch(() => setHome({ online: false, configured: false, error: 'dashboard could not reach the check' }))
    loadDm()
    loadHome()
    const dmTimer = setInterval(loadDm, 30_000)
    const homeTimer = setInterval(loadHome, 60_000)
    return () => { clearInterval(dmTimer); clearInterval(homeTimer) }
  }, [])

  const platforms = [
    { key: 'youtube', label: 'YouTube', connected: !!status?.youtube, detail: status?.youtube?.email },
    { key: 'instagram', label: 'Instagram', connected: !!status?.instagram, detail: status?.instagram?.username ? `@${status.instagram.username}` : null },
    { key: 'tiktok', label: 'TikTok', connected: !!status?.tiktok, detail: status?.tiktok?.displayName },
  ]
  const connectedCount = platforms.filter(p => p.connected).length

  const upcoming = (jobs ?? [])
    .filter(j => j.status === 'pending')
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    .slice(0, 5)

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="h1">Dashboard</h1>
          <p style={{ color: 'var(--text-dim)', marginTop: 4, fontSize: 13 }}>Your content operations at a glance.</p>
        </div>
        <HomePill home={home} />
      </div>

      {/* DM automation funnel — how many were asked, how many tapped, who got it */}
      <DmFunnel dm={dm} />

      {/* Connections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--gap)' }}>
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="h3">Connections</h2>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>{connectedCount}/3</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {platforms.map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                  background: p.connected ? 'var(--ok)' : 'var(--text-mute)',
                  boxShadow: p.connected ? '0 0 8px var(--ok)' : 'none',
                }} />
                <span style={{ fontSize: 13, minWidth: 78 }}>{p.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.connected ? (p.detail ?? 'connected') : 'not connected'}
                </span>
              </div>
            ))}
          </div>
          <Link href="/settings" style={linkRow}>Manage connections <IconArrowRight size={13} /></Link>
        </section>

        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <IconMessage size={16} />
            <h2 className="h3">DM rules</h2>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Stat value={dm?.activeRules ?? 0} label="active" />
            <Stat value={dm?.totalRules ?? 0} label="total" />
            <Stat value={dm?.totalDMs ?? 0} label="people DMed" />
          </div>
          <Link href="/dm" style={linkRow}>Open DM Automation <IconArrowRight size={13} /></Link>
        </section>
      </div>

      {/* Scheduled posts */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <IconClock size={16} />
          <h2 className="h3">Next scheduled posts</h2>
        </div>
        {jobs === null ? (
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>Loading…</p>
        ) : upcoming.length === 0 ? (
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            Nothing scheduled. <Link href="/post" style={{ color: 'var(--accent)' }}>Schedule a post →</Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(job => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--hairline)' }}>
                <IconPost size={15} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.caption?.trim() || job.fileName}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2 }}>
                    {Object.entries(job.platforms).filter(([, on]) => on).map(([p]) => p).join(' · ') || 'no platforms'}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {new Date(job.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick-access tools */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--gap)' }}>
        <Tile href="/linkscribe" Icon={IconLink} title="LinkScribe" sub="Transcribe any link" />
        <Tile href="/readback" Icon={IconHeadphones} title="Readback" sub="Listen to articles" />
      </div>
    </div>
  )
}

const linkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
  fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none',
}

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

// The DM funnel: everyone who got the opt-in button, everyone who tapped it,
// and who the DM actually went out to. Refreshes itself every 30s.
function DmFunnel({ dm }: { dm: DmStats | null }) {
  const totals = dm?.funnel?.totals ?? { asked: 0, sent: 0, failed: 0 }
  const recent = dm?.funnel?.recent ?? []
  const tapRate = totals.asked ? Math.round((totals.sent / totals.asked) * 100) : null

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <IconMessage size={16} />
        <h2 className="h3">DM automation</h2>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)', marginLeft: 'auto' }}>
          {dm === null ? 'loading…' : `${dm.activeRules} active rule${dm.activeRules === 1 ? '' : 's'} · live`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
        <Stat value={totals.asked} label="asked (button sent)" />
        <Stat value={totals.sent} label="tapped → DM sent" color="var(--ok)" />
        <Stat value={tapRate === null ? '—' : `${tapRate}%`} label="tap rate" />
        <Stat value={totals.failed} label="failed" color={totals.failed ? 'var(--bad)' : undefined} />
      </div>

      <div style={{ marginTop: 18, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Recent activity
        </div>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            {dm === null
              ? 'Loading…'
              : 'Nothing yet. Comment one of your keywords on a targeted reel — the button send shows up here, and the tap right after it.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.slice(0, 8).map((e, i) => (
              <div key={`${e.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: STAGE_COLOR[e.stage] }} />
                <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.username ? `@${e.username}` : e.userId ? `user ${e.userId.slice(-6)}` : 'someone'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{STAGE_LABEL[e.stage]}</span>
                <span style={{ fontSize: 12, color: 'var(--text-mute)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.error || e.ruleName || ''}
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)', whiteSpace: 'nowrap' }} title={new Date(e.at).toLocaleString()}>
                  {relativeTime(e.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function HomePill({ home }: { home: HomeHealth | null }) {
  const online = home?.online
  const label = home === null ? 'checking…' : !home.configured ? 'home server not set' : online ? 'home server online' : 'home server offline'
  const color = home === null ? 'var(--text-mute)' : online ? 'var(--ok)' : 'var(--bad)'
  const detail = home === null ? null
    : online ? `${home.latencyMs ?? '?'}ms` : home.error ?? null
  return (
    <div
      title={home?.checkedAt ? `Last checked ${new Date(home.checkedAt).toLocaleTimeString()}${home.error ? ` — ${home.error}` : ''}` : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: online ? `0 0 8px ${color}` : 'none' }} />
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      {detail && <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>{detail}</span>}
    </div>
  )
}

function Tile({ href, Icon, title, sub, external }: { href: string; Icon: (p: { size?: number }) => React.ReactElement; title: string; sub: string; external?: boolean }) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon size={20} />
        {external && <IconExternal size={13} />}
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{sub}</div>
      </div>
    </>
  )
  const style: React.CSSProperties = { ...card, cursor: 'pointer', textDecoration: 'none', color: 'inherit', transition: 'border-color 120ms ease' }
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={style}>{inner}</a>
  }
  return <Link href={href} style={style}>{inner}</Link>
}
