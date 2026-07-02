'use client'
import { useEffect, useRef, useState } from 'react'
import { confirmDialog } from '@/lib/dm/dialog'

export const ACTIVE_WORKSPACE_KEY = 'triggerdm.activeWorkspaceId'
export const WORKSPACES_CHANGED_EVENT = 'workspaceschange'

export function getStoredWorkspaceId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY)
}

export function storeWorkspaceId(id) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
  window.dispatchEvent(new CustomEvent('workspacechange', { detail: { id } }))
}

export function notifyWorkspacesChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WORKSPACES_CHANGED_EVENT))
}

export function resolveActiveWorkspace(workspaces, storedId) {
  if (!workspaces?.length) return null
  return workspaces.find(w => w.id === storedId) || workspaces[0]
}

export default function WorkspaceSwitcher({ workspaces, activeWorkspaceId, onChange, variant = 'inline' }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function select(id) {
    storeWorkspaceId(id)
    onChange?.(id)
    setOpen(false)
  }

  function startEdit(workspace) {
    setEditingId(workspace.id)
    setEditingName(workspace.name)
  }

  async function saveEdit(id) {
    const name = editingName.trim()
    setEditingId(null)
    setEditingName('')
    if (!name) return

    await fetch('/api/dm/workspaces', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    })
    notifyWorkspacesChanged()
  }

  async function deleteWorkspace(workspace) {
    if (!(await confirmDialog(`Delete workspace "${workspace.name}"? Rules are not deleted.`, { confirmLabel: 'Delete', danger: true }))) return

    await fetch('/api/dm/workspaces', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: workspace.id }),
    })
    notifyWorkspacesChanged()
  }

  async function createWorkspace() {
    if (busy) return
    setBusy(true)
    const nextNumber = workspaces.length + 1
    const res = await fetch('/api/dm/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Workspace ${nextNumber}`,
      }),
    })
    if (res.ok) {
      const workspace = await res.json()
      storeWorkspaceId(workspace.id)
      onChange?.(workspace.id)
      notifyWorkspacesChanged()
    }
    setBusy(false)
  }

  if (variant === 'sidebar') {
    const activeWorkspace = resolveActiveWorkspace(workspaces, activeWorkspaceId)

    return (
      <div className="sidebar-workspace" ref={menuRef}>
        <button
          type="button"
          className="sidebar-workspace__trigger"
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
        >
          <span className="sidebar-workspace__icon">
            {activeWorkspace?.name?.[0]?.toUpperCase() || 'W'}
          </span>
          <span className="sidebar-workspace__copy">
            <span className="sidebar-workspace__label">Workspace</span>
            <strong>{activeWorkspace?.name || 'No workspace'}</strong>
          </span>
          <span className={`sidebar-workspace__chevron ${open ? 'open' : ''}`}>⌃</span>
        </button>

        {open && (
          <div className="sidebar-workspace-menu">
            {workspaces.map(workspace => {
              const selected = activeWorkspace?.id === workspace.id
              const editing = editingId === workspace.id

              return (
                <div key={workspace.id} className={`workspace-menu-row ${selected ? 'selected' : ''}`}>
                  <button
                    type="button"
                    className="workspace-menu-select"
                    onClick={() => select(workspace.id)}
                    disabled={editing}
                    aria-label={`Switch to ${workspace.name}`}
                  >
                    <span className="workspace-menu-check">{selected ? '✓' : ''}</span>
                  </button>
                  {editing ? (
                    <input
                      className="workspace-menu-input"
                      value={editingName}
                      autoFocus
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => saveEdit(workspace.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(workspace.id)
                        if (e.key === 'Escape') {
                          setEditingId(null)
                          setEditingName('')
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="workspace-menu-name"
                      onClick={() => select(workspace.id)}
                    >
                      {workspace.name}
                    </button>
                  )}
                  {!editing && (
                    <>
                      <button
                        type="button"
                        className="workspace-menu-icon"
                        onClick={() => startEdit(workspace)}
                        aria-label={`Rename ${workspace.name}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="workspace-menu-icon"
                        onClick={() => deleteWorkspace(workspace)}
                        aria-label={`Delete ${workspace.name}`}
                      >
                        ⌫
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              className="workspace-menu-new"
              onClick={createWorkspace}
              disabled={busy}
            >
              <span>+</span>
              {busy ? 'Adding...' : 'New workspace'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="workspace-switcher">
      <div className="workspace-tabs" aria-label="Workspaces">
        {workspaces.map(workspace => (
          <button
            key={workspace.id}
            type="button"
            className={`workspace-tab ${activeWorkspaceId === workspace.id ? 'selected' : ''}`}
            onClick={() => select(workspace.id)}
            title={workspace.accountName || workspace.name}
          >
            {workspace.name}
          </button>
        ))}
      </div>
    </div>
  )
}
