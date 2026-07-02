'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import DesktopBackButton from './DesktopBackButton'
import { IconSidebar } from './Icons'

interface ConnectionsStatus {
  youtube: { email: string } | null
  instagram: { username: string | null } | null
  tiktok: { displayName: string | null } | null
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [status, setStatus] = useState<ConnectionsStatus | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    function checkMobile() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setNavOpen(false)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key === 'b') { e.preventDefault(); setNavOpen(v => !v) }
      if (isMod && e.key === '1') { e.preventDefault(); router.push('/post') }
      if (isMod && e.key === '2') { e.preventDefault(); router.push('/analysis') }
      if (isMod && e.key === '3') { e.preventDefault(); router.push('/history') }
      if (isMod && e.key === ',') { e.preventDefault(); router.push('/settings') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  const connectedCount = status ? [status.youtube, status.instagram, status.tiktok].filter(Boolean).length : 0
  const email = status?.youtube?.email ?? null

  return (
    <div
      className="app"
      style={{ gridTemplateColumns: isMobile ? '1fr' : (navOpen ? '240px 1fr' : '0 1fr') }}
    >
      <Sidebar
        navOpen={navOpen}
        isMobile={isMobile}
        onToggle={() => setNavOpen(v => !v)}
        pathname={pathname}
        connectedCount={connectedCount}
        email={email}
      />

      {/* Backdrop for mobile sidebar */}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'oklch(0 0 0 / 0.55)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      <button
        className={`nav-reopen${!navOpen ? ' visible' : ''}`}
        onClick={() => setNavOpen(true)}
        title="Open sidebar (⌘B)"
        aria-label="Open sidebar"
      >
        <IconSidebar size={17} />
      </button>

      <main
        className="scroll"
        style={{
          padding: 'var(--pad)',
          position: 'relative',
          height: isMobile ? 'auto' : '100vh',
          minHeight: isMobile ? '100vh' : undefined,
          overflowY: isMobile ? 'visible' : 'auto',
        }}
      >
        {children}
      </main>

      <DesktopBackButton />
    </div>
  )
}
