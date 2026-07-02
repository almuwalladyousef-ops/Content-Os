'use client'

import { useCallback, useEffect, useState } from 'react'
import useActiveWorkspace from '@/components/dm/useActiveWorkspace'

export default function SettingsPage() {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState(null)
  const { activeWorkspace, loadingWorkspaces } = useActiveWorkspace()

  const refresh = useCallback(() => {
    if (!activeWorkspace?.id) return
    fetch(`/api/dm/accounts/status?workspaceId=${activeWorkspace.id}`)
      .then(r => r.json())
      .then(setAccounts)
      .catch(() => setError('Could not load account status.'))
  }, [activeWorkspace?.id])

  useEffect(() => {
    if (!activeWorkspace?.id) return
    setAccounts(null)
    refresh()
  }, [activeWorkspace?.id, refresh])

  // Re-check whenever the user returns to the tab so the badge updates after
  // completing the Instagram Login flow.
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  return (
    <div className="page">
      <div className="page-header">
        <h1>DM Settings</h1>
      </div>

      <section>
        <h2>Connected Instagram account</h2>
        <p className="hint">
          Automations use the Instagram account you connect here. Connecting opens
          the single Instagram Login — any professional (Business or Creator)
          account works, and the same login also powers posting and analytics.
        </p>

        {error && <p className="empty-state__sub" style={{ color: 'var(--danger)' }}>{error}</p>}
        {(loadingWorkspaces || (!accounts && !error)) && <p className="loading">Checking account…</p>}

        <div className="account-status-list">
          {accounts?.map(acc => (
            <div key={acc.key} className="account-status-card">
              <div className="account-status-info">
                <span className="account-status-name">
                  {acc.connected ? acc.name : 'No Instagram account connected'}
                </span>
                {acc.igId && (
                  <span className="account-status-error">Instagram ID: {acc.igId}</span>
                )}
                <span className={`badge ${acc.valid ? 'badge-ok' : 'badge-bad'}`}>
                  {acc.valid ? 'Connected' : 'Not connected'}
                </span>
                {!acc.valid && acc.error && (
                  <span className="account-status-error">{acc.error}</span>
                )}
              </div>
              <a className="btn-primary" href="/api/auth/instagram/connect">
                {acc.valid ? 'Reconnect' : 'Connect Instagram'}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
