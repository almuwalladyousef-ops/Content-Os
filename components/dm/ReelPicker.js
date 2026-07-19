'use client'
import { useEffect, useState } from 'react'

export default function ReelPicker({ igId, selected, applyToAll, onChange }) {
  const [result, setResult] = useState({ igId: null, reels: [] })

  useEffect(() => {
    if (!igId) return
    const controller = new AbortController()
    fetch(`/api/dm/reels?igId=${igId}`, { signal: controller.signal })
      .then(r => r.json())
      .then(reels => setResult({ igId, reels }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ igId, reels: [] })
      })
    return () => controller.abort()
  }, [igId])

  const reels = result.igId === igId ? result.reels : []
  const loading = Boolean(igId && result.igId !== igId)

  function toggle(reelId) {
    const next = selected.includes(reelId)
      ? selected.filter(id => id !== reelId)
      : [...selected, reelId]
    onChange({ targetReels: next, applyToAll: false })
  }

  return (
    <div className="reel-picker">
      <div className="reel-scope-picker" role="group" aria-label="Choose reel audience">
        <button
          type="button"
          className={!applyToAll ? 'active' : ''}
          aria-pressed={!applyToAll}
          onClick={() => onChange({ targetReels: selected, applyToAll: false })}
        >
          Selected reels
        </button>
        <button
          type="button"
          className={applyToAll ? 'active' : ''}
          aria-pressed={applyToAll}
          onClick={() => onChange({ targetReels: [], applyToAll: true })}
        >
          All current and future
        </button>
      </div>

      {!applyToAll && (
        <>
          {!igId && <p className="hint">Select a workspace to see its reels.</p>}
          {igId && loading && <p className="loading">Loading reels…</p>}
          {igId && !loading && reels.length === 0 && (
            <p className="empty">No reels found for this account.</p>
          )}
          <div className="reel-grid">
            {reels.map(reel => (
              <button
                type="button"
                key={reel.id}
                className={`reel-card ${selected.includes(reel.id) ? 'selected' : ''}`}
                aria-label={`Select reel: ${reel.caption?.slice(0, 60) || 'No caption'}`}
                aria-pressed={selected.includes(reel.id)}
                onClick={() => toggle(reel.id)}
              >
                {reel.thumbnail_url ? (
                  // Instagram thumbnail hosts are dynamic, so a native image is intentional.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reel.thumbnail_url} alt={reel.caption || 'Reel'} />
                ) : (
                  <div className="reel-placeholder">▶</div>
                )}
                <p className="reel-caption">{reel.caption?.slice(0, 60) || 'No caption'}</p>
                {selected.includes(reel.id) && <div className="reel-check">✓</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
