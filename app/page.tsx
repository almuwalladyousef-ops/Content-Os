'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  IconPost, IconMessage, IconLink, IconHeadphones, IconLayout,
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
interface DmStats { totalDMs: number; totalRules: number; activeRules: number }

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
  const [home, setHome] = useState<{ online: boolean; configured: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setStatus).catch(() => {})
    fetch('/api/schedule').then(r => r.json()).then(d => setJobs(d.jobs ?? [])).catch(() => setJobs([]))
    fetch('/api/dm/stats').then(r => r.json()).then(setDm).catch(() => {})
    fetch('/api/home/health').then(r => r.json()).then(setHome).catch(() => setHome({ online: false, configured: false }))
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

      {/* Top row: connections + DM stats */}
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
            <h2 className="h3">DM Automation</h2>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Stat value={dm?.activeRules ?? 0} label="active rules" />
            <Stat value={dm?.totalRules ?? 0} label="total rules" />
            <Stat value={dm?.totalDMs ?? 0} label="DMs sent" />
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
        <Tile href="/api/home/board" external Icon={IconLayout} title="Board" sub="Vault kanban" />
      </div>
    </div>
  )
}

const linkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
  fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none',
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function HomePill({ home }: { home: { online: boolean; configured: boolean } | null }) {
  const online = home?.online
  const label = home === null ? 'checking…' : !home.configured ? 'home server not set' : online ? 'home server online' : 'home server offline'
  const color = home === null ? 'var(--text-mute)' : online ? 'var(--ok)' : 'var(--bad)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
      borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: online ? `0 0 8px ${color}` : 'none' }} />
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
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
