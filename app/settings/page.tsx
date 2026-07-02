'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { IconShield, LogoTikTok, LogoInstagram, LogoYouTube } from '@/components/Icons'

interface ConnectionsStatus {
  youtube: { email: string } | null
  instagram: { username: string | null } | null
  tiktok: { displayName: string | null } | null
}

type Platform = 'youtube' | 'instagram' | 'tiktok'

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}

function SectionHead({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <div>
        {eyebrow && <div className="micro" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h2 className="h2">{title}</h2>
      </div>
    </div>
  )
}

function IntegrationCard({ title, sub, connected, identity, actionLabel, onAction, onDisconnect, disconnecting, icon, color }: {
  title: string
  sub: string
  connected: boolean
  identity?: string | null
  actionLabel: string
  onAction: () => void
  onDisconnect?: () => void
  disconnecting?: boolean
  icon?: React.ReactNode
  color?: string
}) {
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: color ? `oklch(from ${color} l c h / 0.12)` : 'var(--bg-2)',
          color: color || 'var(--text)',
          display: 'grid', placeItems: 'center',
          border: '1px solid', borderColor: color ? `oklch(from ${color} l c h / 0.3)` : 'var(--hairline)',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
            {connected ? (
              <span className="pill ok" style={{ height: 18, fontSize: 10 }}><span className="dot" /> connected</span>
            ) : (
              <span className="pill" style={{ height: 18, fontSize: 10 }}><span className="dot" /> not connected</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{sub}</div>
          {connected && identity && (
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 8 }}>{identity}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {connected && onDisconnect && (
            <button
              className="btn tiny"
              onClick={onDisconnect}
              disabled={disconnecting}
              style={{ color: 'var(--bad)', borderColor: 'oklch(0.70 0.19 25 / 0.3)' }}
            >
              {disconnecting ? '…' : 'Disconnect'}
            </button>
          )}
          <button className="btn tiny" onClick={onAction}>{actionLabel}</button>
        </div>
      </div>
    </div>
  )
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<ConnectionsStatus | null>(null)
  const [disconnecting, setDisconnecting] = useState<Platform | null>(null)
  const [origin] = useState(() => typeof window === 'undefined' ? '' : window.location.origin)
  const [copied, setCopied] = useState('')

  const banners: { ok: boolean; msg: string }[] = []
  const pushBanner = (connectedKey: string, errorKey: string, label: string) => {
    if (searchParams.get(connectedKey) === '1') banners.push({ ok: true, msg: `${label} connected successfully` })
    const err = searchParams.get(errorKey)
    if (err) banners.push({ ok: false, msg: `${label} connection failed: ${err}` })
  }
  pushBanner('yt_connected', 'yt_error', 'YouTube')
  pushBanner('ig_connected', 'ig_error', 'Instagram')
  pushBanner('tt_connected', 'tt_error', 'TikTok')

  function load() {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then((s: ConnectionsStatus) => setStatus(s))
      .catch(() => {})
  }

  useEffect(() => {
    load()
  }, [])

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* ignore */ }
  }

  const connectUrl: Record<Platform, string> = {
    youtube: '/api/auth/connect',
    instagram: '/api/auth/instagram/connect',
    tiktok: '/api/auth/tiktok/connect',
  }

  const redirectUris: { label: string; path: string; where: string }[] = [
    { label: 'Google', path: '/api/auth/callback', where: 'Google Cloud → Credentials → OAuth client → Authorized redirect URIs' },
    { label: 'Instagram', path: '/api/auth/instagram/callback', where: 'Meta app → Facebook Login → Settings → Valid OAuth Redirect URIs' },
    { label: 'TikTok', path: '/api/auth/tiktok/callback', where: 'TikTok app → Login Kit → Redirect URI' },
  ]

  function connect(platform: Platform) {
    window.location.href = connectUrl[platform]
  }

  async function disconnect(platform: Platform, label: string) {
    if (!confirm(`Disconnect ${label}? You'll need to reconnect to post or pull analytics.`)) return
    setDisconnecting(platform)
    try {
      await fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      load()
    } catch { /* ignore */ } finally {
      setDisconnecting(null)
    }
  }

  const ytConnected = !!status?.youtube
  const igConnected = !!status?.instagram
  const ttConnected = !!status?.tiktok
  const connectedCount = [ytConnected, igConnected, ttConnected].filter(Boolean).length

  return (
    <div className="anim-up" style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>Connections</div>
          <h1 className="h1">Settings</h1>
        </div>
        <span className="pill"><span className="dot" style={{ background: connectedCount === 3 ? 'var(--ok)' : undefined }} />{connectedCount}/3 connected</span>
      </div>

      {/* OAuth banners */}
      {banners.map((b, i) => (
        <div key={i} style={{
          background: b.ok ? 'oklch(0.78 0.16 155 / 0.12)' : 'oklch(0.70 0.19 25 / 0.1)',
          border: `1px solid ${b.ok ? 'oklch(0.78 0.16 155 / 0.3)' : 'oklch(0.70 0.19 25 / 0.3)'}`,
          color: b.ok ? 'var(--ok)' : 'var(--bad)',
          padding: '10px 16px', borderRadius: 10, fontSize: 13,
        }}>
          {b.msg}
        </div>
      ))}

      <SectionHead eyebrow="One click each" title="Connect your accounts" />
      <div style={{ fontSize: 12.5, color: 'var(--text-mute)', marginTop: -8 }}>
        Press Connect and authorize — nothing to copy or paste. Each account stays connected until you disconnect it.
      </div>

      <IntegrationCard
        title="YouTube"
        sub="Upload · Drive · Analytics (via Google)"
        connected={ytConnected}
        identity={status?.youtube?.email}
        actionLabel={ytConnected ? 'Reconnect' : 'Connect'}
        onAction={() => connect('youtube')}
        onDisconnect={() => disconnect('youtube', 'YouTube')}
        disconnecting={disconnecting === 'youtube'}
        icon={<LogoYouTube size={20} />}
        color="oklch(0.68 0.21 25)"
      />

      <IntegrationCard
        title="Instagram"
        sub="Reels publishing · insights"
        connected={igConnected}
        identity={status?.instagram?.username ? `@${status.instagram.username}` : 'Connected'}
        actionLabel={igConnected ? 'Reconnect' : 'Connect'}
        onAction={() => connect('instagram')}
        onDisconnect={() => disconnect('instagram', 'Instagram')}
        disconnecting={disconnecting === 'instagram'}
        icon={<LogoInstagram size={20} />}
        color="oklch(0.70 0.20 340)"
      />

      <IntegrationCard
        title="TikTok"
        sub="Direct posting · video stats"
        connected={ttConnected}
        identity={status?.tiktok?.displayName ? `@${status.tiktok.displayName}` : 'Connected'}
        actionLabel={ttConnected ? 'Switch account' : 'Connect'}
        onAction={() => connect('tiktok')}
        onDisconnect={() => disconnect('tiktok', 'TikTok')}
        disconnecting={disconnecting === 'tiktok'}
        icon={<LogoTikTok size={20} />}
        color="oklch(0.85 0.15 200)"
      />

      {/* Developer setup — redirect URIs to register */}
      <SectionHead eyebrow="One-time developer setup" title="Redirect URIs to register" />
      <div style={{ fontSize: 12.5, color: 'var(--text-mute)', marginTop: -8 }}>
        If a Connect button shows “URL Blocked” or a scope error, the platform’s developer
        console is missing this exact callback URL. Copy each into the place noted, then retry.
      </div>
      <div className="card" style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {redirectUris.map(({ label, path, where }) => {
          const uri = origin ? `${origin}${path}` : path
          return (
            <div key={label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="micro">{label}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code className="mono" style={{
                  flex: 1, minWidth: 0, fontSize: 12, padding: '7px 10px', borderRadius: 8,
                  background: 'var(--bg-2)', border: '1px solid var(--hairline)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{uri}</code>
                <button className="btn tiny" onClick={() => copy(uri, label)} style={{ flexShrink: 0 }}>
                  {copied === label ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{where}</div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <IconShield size={18} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          Authorizations are stored encrypted in your browser session only. ContentOS never sees your passwords.
        </div>
      </div>
    </div>
  )
}
