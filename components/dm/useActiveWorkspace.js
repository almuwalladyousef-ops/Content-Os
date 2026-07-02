'use client'
import { useEffect, useState } from 'react'
import {
  getStoredWorkspaceId,
  resolveActiveWorkspace,
  storeWorkspaceId,
  WORKSPACES_CHANGED_EVENT,
} from './WorkspaceSwitcher'

export default function useActiveWorkspace() {
  const [workspaces, setWorkspaces] = useState([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)

  async function loadWorkspaces() {
    setLoadingWorkspaces(true)
    try {
      const nextWorkspaces = await fetch('/api/dm/workspaces').then(r => r.json())
      const active = resolveActiveWorkspace(nextWorkspaces, getStoredWorkspaceId())
      setWorkspaces(nextWorkspaces)
      setActiveWorkspaceId(active?.id || null)
      if (active) storeWorkspaceId(active.id)
    } finally {
      setLoadingWorkspaces(false)
    }
  }

  useEffect(() => {
    loadWorkspaces().catch(() => setLoadingWorkspaces(false))

    function handleWorkspaceChange(event) {
      setActiveWorkspaceId(event.detail?.id || getStoredWorkspaceId())
    }

    window.addEventListener('workspacechange', handleWorkspaceChange)
    window.addEventListener(WORKSPACES_CHANGED_EVENT, loadWorkspaces)
    return () => {
      window.removeEventListener('workspacechange', handleWorkspaceChange)
      window.removeEventListener(WORKSPACES_CHANGED_EVENT, loadWorkspaces)
    }
  }, [])

  const activeWorkspace = resolveActiveWorkspace(workspaces, activeWorkspaceId)

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id || activeWorkspaceId,
    loadingWorkspaces,
    setActiveWorkspaceId,
    reloadWorkspaces: loadWorkspaces,
  }
}
