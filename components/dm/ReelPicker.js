'use client'
import { useEffect, useState } from 'react'

export default function ReelPicker({ igId, selected, applyToAll, onChange }) {
  const [reels, setReels] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!igId) { setReels([]); return }
    setLoading(true)
    fetch(`/api/dm/reels?igId=${igId}`)
      .then(r => r.json())
      .then(data => { setReels(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [igId])

  function toggle(reelId) {
    const next = selected.includes(reelId)
      ? selected.filter(id => id !== reelId)
      : [...selected, reelId]
    onChange({ targetReels: next, applyToAll: false })
  }

  return (
    <div className="reel-picker">
      <label className="apply-all">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={e => onChange({ targetReels: [], applyToAll: e.target.checked })}
        />
        Apply to all reels (current and future)
      </label>

      {!applyToAll && (
        <>
          {!igId && <p className="hint">Select a workspace to see its reels.</p>}
          {igId && loading && <p className="loading">Loading reels…</p>}
          {igId && !loading && reels.length === 0 && (
            <p className="empty">No reels found for this account.</p>
          )}
          <div className="reel-grid">
            {reels.map(reel => (
              <div
                key={reel.id}
                className={`reel-card ${selected.includes(reel.id) ? 'selected' : ''}`}
                onClick={() => toggle(reel.id)}
              >
                {reel.thumbnail_url ? (
                  <img src={reel.thumbnail_url} alt={reel.caption || 'Reel'} />
                ) : (
                  <div className="reel-placeholder">▶</div>
                )}
                <p className="reel-caption">{reel.caption?.slice(0, 60) || 'No caption'}</p>
                {selected.includes(reel.id) && <div className="reel-check">✓</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
