'use client'

import { useEffect, useRef, useState } from 'react'

interface Workspace {
  id: string
  name: string
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeId: string
}

const chev = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const check = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)
const plus = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const pencil = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const trash = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

export default function WorkspaceSwitcher() {
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/workspaces').then(r => r.json()).then(setState).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setEditingId(null) }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = state?.workspaces.find(w => w.id === state.activeId)

  async function switchTo(id: string) {
    if (!state || id === state.activeId || busy) return
    setBusy(true)
    try {
      await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      // Connections are read server-side from cookies — reload so everything re-reads the new workspace.
      window.location.reload()
    } catch { setBusy(false) }
  }

  async function createWorkspace() {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      window.location.reload()
    } catch { setBusy(false) }
  }

  async function rename(id: string) {
    const name = draft.trim()
    setEditingId(null)
    if (!name || !state) return
    const prev = state
    setState({ ...state, workspaces: state.workspaces.map(w => (w.id === id ? { ...w, name } : w)) })
    try {
      const next = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      }).then(r => r.json())
      setState(next)
    } catch { setState(prev) }
  }

  async function remove(id: string) {
    if (!state || state.workspaces.length <= 1 || busy) return
    const w = state.workspaces.find(x => x.id === id)
    if (!confirm(`Delete "${w?.name}"? Its connected accounts will be removed.`)) return
    setBusy(true)
    try {
      const next: WorkspaceState = await fetch('/api/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).then(r => r.json())
      if (id === state.activeId) {
        window.location.reload()
        return
      }
      setState(next)
      setBusy(false)
    } catch { setBusy(false) }
  }

  if (!state) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'var(--bg-2)',
          border: '1px solid var(--hairline)',
          color: 'inherit',
          textAlign: 'left',
          transition: 'border-color 120ms ease',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), oklch(0.62 0.16 280))',
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 700, color: 'oklch(0.18 0.013 255)',
        }}>
          {(active?.name ?? 'W').slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="micro" style={{ fontSize: 8.5, color: 'var(--text-mute)', lineHeight: 1 }}>WORKSPACE</div>
          <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {active?.name ?? '—'}
          </div>
        </div>
        <span style={{ color: 'var(--text-mute)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}>{chev}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
          background: 'oklch(0.185 0.013 255)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 6,
          boxShadow: '0 12px 30px oklch(0 0 0 / 0.45)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {state.workspaces.map(w => {
            const isActive = w.id === state.activeId
            const isEditing = editingId === w.id
            return (
              <div
                key={w.id}
                className="ws-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 8px', borderRadius: 8,
                  background: isActive ? 'var(--surface-2)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'oklch(0.215 0.014 255 / 0.6)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ width: 14, flexShrink: 0, color: 'var(--accent)' }}>{isActive ? check : null}</span>
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') rename(w.id); if (e.key === 'Escape') setEditingId(null) }}
                    onBlur={() => rename(w.id)}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 12.5,
                      background: 'var(--bg-2)', color: 'var(--text)',
                      border: '1px solid var(--accent)', borderRadius: 6, padding: '3px 6px',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => switchTo(w.id)}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12.5, color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {w.name}
                  </button>
                )}
                {!isEditing && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button
                      title="Rename"
                      onClick={() => { setEditingId(w.id); setDraft(w.name) }}
                      style={{ padding: 4, borderRadius: 6, color: 'var(--text-mute)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-mute)' }}
                    >{pencil}</button>
                    {state.workspaces.length > 1 && (
                      <button
                        title="Delete"
                        onClick={() => remove(w.id)}
                        style={{ padding: 4, borderRadius: 6, color: 'var(--text-mute)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--bad)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-mute)' }}
                      >{trash}</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 2px' }} />

          <button
            onClick={createWorkspace}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px', borderRadius: 8,
              color: 'var(--text-dim)', fontSize: 12.5,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.215 0.014 255 / 0.6)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ width: 14, display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>{plus}</span>
            New workspace
          </button>
        </div>
      )}
    </div>
  )
}
