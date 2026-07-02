'use client'

import Link from 'next/link'
import {
  IconPost,
  IconAnalysis,
  IconHistory,
  IconSettings,
  IconSidebar,
} from './Icons'
import WorkspaceSwitcher from './WorkspaceSwitcher'

interface SidebarProps {
  navOpen: boolean
  isMobile: boolean
  onToggle: () => void
  pathname: string
  connectedCount: number
  email: string | null
}

const NAV_ITEMS = [
  { href: '/post',     label: 'Post',     Icon: IconPost,     shortcut: '⌘1' },
  { href: '/analysis', label: 'Analysis', Icon: IconAnalysis, shortcut: '⌘2' },
  { href: '/history',  label: 'History',  Icon: IconHistory,  shortcut: '⌘3' },
  { href: '/settings', label: 'Settings', Icon: IconSettings, shortcut: '⌘,' },
]

export default function Sidebar({ navOpen, isMobile, onToggle, pathname, connectedCount, email }: SidebarProps) {
  const initials = email ? email.slice(0, 2).toUpperCase() : 'YO'

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '20px 14px',
        borderRight: '1px solid var(--border)',
        background: 'oklch(0.155 0.012 255 / 0.95)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        ...(isMobile ? {
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100dvh',
          width: 260,
          zIndex: 45,
          overflowY: 'auto',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))',
          transform: navOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 280ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          pointerEvents: navOpen ? 'auto' : 'none',
        } : {
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          opacity: navOpen ? 1 : 0,
          transition: 'opacity 180ms ease',
          pointerEvents: navOpen ? 'auto' : 'none',
        }),
      }}
    >
      {/* Logo row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 10px' }}>
        <Logo />
        <button
          onClick={onToggle}
          title="Close sidebar (⌘B)"
          style={{
            width: 26, height: 26,
            display: 'grid', placeItems: 'center',
            borderRadius: 7,
            border: '1px solid transparent',
            color: 'var(--text-mute)',
            transition: 'all 120ms ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'var(--surface-2)'
            el.style.color = 'var(--text)'
            el.style.borderColor = 'var(--hairline)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'transparent'
            el.style.color = 'var(--text-mute)'
            el.style.borderColor = 'transparent'
          }}
        >
          <IconSidebar size={15} />
        </button>
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(({ href, label, Icon, shortcut }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 9,
                color: active ? 'var(--text)' : 'var(--text-dim)',
                background: active ? 'var(--surface-2)' : 'transparent',
                border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
                position: 'relative',
                transition: 'all 120ms ease',
                textDecoration: 'none',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'oklch(0.215 0.014 255 / 0.5)'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
              }}
            >
              {/* Left accent bar for active item */}
              {active && (
                <span style={{
                  position: 'absolute',
                  left: -14,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: 'var(--accent)',
                  borderRadius: 999,
                  boxShadow: '0 0 8px var(--accent-glow)',
                }} />
              )}
              <Icon size={17} />
              <span style={{ fontSize: 13, fontWeight: active ? 500 : 400 }}>{label}</span>
              <span
                className="mono"
                style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-mute)' }}
              >
                {shortcut}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom slot */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Legal links */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '0 6px' }}>
          <Link
            href="/privacy"
            style={{ fontSize: 10.5, color: 'var(--text-mute)', textDecoration: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-mute)' }}
          >
            Privacy Policy
          </Link>
          <span style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>·</span>
          <Link
            href="/terms"
            style={{ fontSize: 10.5, color: 'var(--text-mute)', textDecoration: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-mute)' }}
          >
            Terms of Service
          </Link>
        </div>


        {/* Connections summary */}
        <Link
          href="/settings"
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: 8,
            borderRadius: 10,
            background: 'var(--bg-2)',
            border: '1px solid var(--hairline)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{
            width: 30, height: 30,
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), oklch(0.62 0.16 280))',
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 600,
            color: 'oklch(0.18 0.013 255)',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {email ?? 'Manage connections'}
            </div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 2 }}>
              {connectedCount}/3 connected
            </div>
          </div>
        </Link>
      </div>
    </aside>
  )
}

function Logo() {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0, lineHeight: 1 }}>ContentOS Flames</div>
      <div
        className="mono"
        style={{ fontSize: 9.5, color: 'var(--text-mute)', letterSpacing: 0, textTransform: 'uppercase', marginTop: 3 }}
      >
        v0.2 · preview
      </div>
    </div>
  )
}
