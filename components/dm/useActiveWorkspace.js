'use client'
import { useCallback, useEffect, useState } from 'react'

// The active workspace is the same one the main sidebar switcher controls
// (lib/connections.ts, cookie-backed). Switching it triggers a full page
// reload, so this hook just needs to fetch the current state on mount.
export default function useActiveWorkspace() {
  const [workspaces, setWorkspaces] = useState([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)

  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true)
    try {
      const next = await fetch('/api/dm/workspaces').then(r => r.json())
      setWorkspaces(next)
    } finally {
      setLoadingWorkspaces(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces().catch(() => setLoadingWorkspaces(false))
  }, [loadWorkspaces])

  const activeWorkspace = workspaces.find(w => w.active) || null

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id || null,
    loadingWorkspaces,
    reloadWorkspaces: loadWorkspaces,
  }
}
