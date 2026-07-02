'use client'

import { useEffect, useState } from 'react'

/**
 * "← Content OS" button — only shown when the poster is running as a full-page
 * view inside the Content OS desktop app (opened with ?desktop=1). It navigates
 * the webview back to the Content OS shell (its local server on :3737), since
 * that top-level page replaced the app's own launcher.
 *
 * On the normal web (phone / browser) the flag is never set, so this renders
 * nothing and the site is unaffected.
 */

const CONTENT_OS_URL = 'http://localhost:3737/'
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
      title="Back to Content OS"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        color: 'var(--text)',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px oklch(0 0 0 / 0.4)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>‹</span>
      Content OS
    </button>
  )
}
