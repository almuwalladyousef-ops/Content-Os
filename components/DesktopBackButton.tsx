'use client'

import { useEffect, useState } from 'react'

/**
 * "← Content OS" button — only shown when the poster is running as a full-page
 * view inside the Content OS desktop app (opened with ?desktop=1). It navigates
 * the webview back to the Content OS board, served by the home server (the
 * /api/home/board proxy 302s to HOME_SERVER_URL, so no URL is hardcoded here).
 *
 * On the normal web (phone / browser) the flag is never set, so this renders
 * nothing and the site is unaffected.
 */

const CONTENT_OS_URL = '/api/home/board'
const FLAG = 'contentos:desktop'

export default function DesktopBackButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('desktop') === '1') localStorage.setItem(FLAG, '1')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read client-only flag after mount
    setShow(localStorage.getItem(FLAG) === '1')
  }, [])

  if (!show) return null

  return (
    <button
      onClick={() => { window.location.href = CONTENT_OS_URL }}
      title="Switch to Content OS"
      aria-label="Switch to Content OS"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 26,
        height: 26,
        padding: 0,
        flex: 'none',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 7,
        color: 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease, transform 100ms ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.background = 'var(--surface-3)'
        el.style.color = 'var(--accent)'
        el.style.borderColor = 'var(--accent-glow)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = 'var(--bg-2)'
        el.style.color = 'var(--text-dim)'
        el.style.borderColor = 'var(--border)'
        el.style.transform = 'scale(1)'
      }}
      onMouseDown={e => {
        const el = e.currentTarget
        el.style.background = 'var(--accent)'
        el.style.color = 'oklch(0.18 0.013 255)'
        el.style.transform = 'scale(.92)'
      }}
      onMouseUp={e => {
        const el = e.currentTarget
        el.style.transform = 'scale(1)'
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, display: 'block' }}>
        <path d="M4 8h13l-4-4M4 8l4 4" />
        <path d="M20 16H7l4 4M20 16l-4-4" />
      </svg>
    </button>
  )
}
