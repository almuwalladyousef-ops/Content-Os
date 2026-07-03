'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACCOUNT_META, Card, CardStatus, FORMAT_META, NEXT,
  apiCreate, apiDelete, apiWrite, openInObsidian, parentDir,
  safeMarkdownFileName, statusLabel, writeFM,
} from '@/lib/board/model'

/**
 * File editor — centered, resizable (drag the corner or maximize), with one
 * continuous writing area for the whole note plus the file-setup panel
 * (name, source, brand, format, film/post date+time, finished link) and the
 * full action set (save / move next / open in Obsidian / archive / delete).
 */
export default function FileEditor({ file, onClose, onMove, onSaved, onError, onDeleted }: {
  file: Card
  onClose: () => void
  onMove: (path: string, status: CardStatus) => void
  onSaved: (msg: string) => void
  onError: (msg: string) => void
  onDeleted: () => void
}) {
  const initial = useMemo(() => {
    const h1 = file.body.match(/^\s*#\s+(.+)\r?\n?/)
    return {
      title: h1 ? h1[1].trim() : file.title,
      text: h1 ? file.body.slice(h1[0].length).replace(/^\n+/, '') : file.body,
    }
  }, [file])

  const [title, setTitle] = useState(initial.title)
  const [text, setText] = useState(initial.text)
  const [fileName, setFileName] = useState(file.name.replace(/\.md$/i, ''))
  const [source, setSource] = useState(file.data.source ?? '')
  const [account, setAccount] = useState(file.data.account ?? file.account ?? '')
  const [format, setFormat] = useState(file.data.format ?? file.format ?? '')
  const [filmDate, setFilmDate] = useState(file.data.film_date ?? '')
  const [filmTime, setFilmTime] = useState(file.data.film_time ?? '')
  const [postDate, setPostDate] = useState(file.data.post_date ?? '')
  const [postTime, setPostTime] = useState(file.data.post_time ?? '')
  const [proof, setProof] = useState(file.data.proof ?? '')
  const [busy, setBusy] = useState(false)
  const [setupOpen, setSetupOpen] = useState(true)
  const [maxed, setMaxed] = useState(false)

  const body = useMemo(
    () => (title ? `# ${title}\n\n${text.replace(/^\n+/, '')}` : text),
    [title, text],
  )
  const counts = useMemo(() => ({
    words: (body.match(/\S+/g) || []).length,
    chars: body.length,
  }), [body])

  const next = file.status ? NEXT[file.status] : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, fileName, source, account, format, filmDate, filmTime, postDate, postTime, proof])

  async function save() {
    setBusy(true)
    try {
      const data = {
        ...file.data,
        summary: title || file.data.summary,
        ...(account ? { account } : {}),
        ...(format ? { format } : {}),
        source: source || null,
        proof: proof || null,
        film_date: filmDate || null,
        film_time: filmTime || null,
        post_date: postDate || null,
        post_time: postTime || null,
      }
      const content = writeFM(data, body.endsWith('\n') ? body : body + '\n')
      const newName = safeMarkdownFileName(fileName)
      if (newName && newName !== file.name) {
        const dir = parentDir(file.path)
        const newPath = dir ? `${dir}/${newName}` : newName
        await apiCreate(newPath, content)
        await apiDelete(file.path)
      } else {
        await apiWrite(file.path, content)
      }
      onSaved('Saved')
    } catch (e) {
      onError('Save failed: ' + (e as Error).message)
    }
    setBusy(false)
  }

  async function remove() {
    if (!confirm(`Delete "${title}"? This removes the file from your vault.`)) return
    setBusy(true)
    try { await apiDelete(file.path); onDeleted() }
    catch (e) { onError('Delete failed: ' + (e as Error).message); setBusy(false) }
  }

  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'oklch(0 0 0 / 0.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="anim-up"
        style={{
          background: 'oklch(0.175 0.013 255)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 30px 80px oklch(0 0 0 / 0.55)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          // Centered window: drag the bottom-right corner to resize, or maximize.
          resize: maxed ? 'none' : 'both',
          width: maxed ? '100%' : 'min(860px, 94vw)',
          height: maxed ? '100%' : 'min(620px, 88vh)',
          minWidth: 480, minHeight: 340,
          maxWidth: '100%', maxHeight: '100%',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderBottom: '1px solid var(--hairline)', flexWrap: 'wrap',
        }}>
          <span className="micro" style={{ color: 'var(--accent)' }}>{statusLabel(file.status)}</span>
          <span className="mono mute" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 100 }}>
            {file.path}
          </span>
          <span className="mono dim" style={{ fontSize: 10 }}>
            {counts.words}w · {counts.chars}c
          </span>
          <button className="btn tiny ghost" onClick={() => setSetupOpen(v => !v)}>
            {setupOpen ? 'Hide' : 'Setup'}
          </button>
          <button className="btn tiny ghost" title={maxed ? 'Restore size' : 'Maximize'} onClick={() => setMaxed(v => !v)}>
            {maxed ? '⤡' : '⤢'}
          </button>
          <button className="btn tiny ghost" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* One continuous writing area */}
          <div className="scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 18px' }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title"
              style={{
                fontSize: 19, fontWeight: 550, letterSpacing: '-0.01em',
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text)', width: '100%', padding: '0 0 10px',
              }}
            />
            <AutoTextarea value={text} onChange={setText} placeholder="Write…" />
          </div>

          {/* File setup / actions */}
          {setupOpen && (
            <div className="scroll" style={{
              width: 240, flexShrink: 0, overflowY: 'auto',
              borderLeft: '1px solid var(--hairline)',
              padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={field}>
                <label className="micro" style={{ color: 'var(--text-mute)' }}>File name</label>
                <input className="input" value={fileName} onChange={e => setFileName(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }} />
              </div>

              <div style={field}>
                <label className="micro" style={{ color: 'var(--text-mute)' }}>Source</label>
                <input className="input" value={source ?? ''} onChange={e => setSource(e.target.value)} placeholder="Link or source" style={{ padding: '6px 10px', fontSize: 12 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={field}>
                  <label className="micro" style={{ color: 'var(--text-mute)' }}>Brand</label>
                  <select className="input" value={account ?? ''} onChange={e => setAccount(e.target.value)} style={{ padding: '6px 8px', fontSize: 12 }}>
                    <option value="">—</option>
                    {ACCOUNT_META.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
                <div style={field}>
                  <label className="micro" style={{ color: 'var(--text-mute)' }}>Format</label>
                  <select className="input" value={format ?? ''} onChange={e => setFormat(e.target.value)} style={{ padding: '6px 8px', fontSize: 12 }}>
                    <option value="">—</option>
                    {FORMAT_META.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              <DateTimeField
                label="Film date" dotColor="var(--ok)"
                date={filmDate ?? ''} time={filmTime ?? ''}
                onDate={setFilmDate} onTime={setFilmTime}
                onClear={() => { setFilmDate(''); setFilmTime('') }}
              />
              <DateTimeField
                label="Post date" dotColor="var(--accent)"
                date={postDate ?? ''} time={postTime ?? ''}
                onDate={setPostDate} onTime={setPostTime}
                onClear={() => { setPostDate(''); setPostTime('') }}
              />

              <div style={field}>
                <label className="micro" style={{ color: 'var(--text-mute)' }}>Finished</label>
                <input className="input" value={proof ?? ''} onChange={e => setProof(e.target.value)} placeholder="Finished link" style={{ padding: '6px 10px', fontSize: 12 }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto', paddingTop: 8 }}>
                <button className="btn primary" disabled={busy} onClick={save}>Save file</button>
                {next && (
                  <button className="btn" disabled={busy} onClick={() => onMove(file.path, next)}>
                    Move to {statusLabel(next)}
                  </button>
                )}
                <button className="btn" disabled={busy} onClick={() => openInObsidian(file.path)}>
                  Open in Obsidian
                </button>
                {file.status !== 'archive' ? (
                  <button className="btn ghost" disabled={busy} onClick={() => onMove(file.path, 'archive')}>Archive</button>
                ) : (
                  <button className="btn" disabled={busy} onClick={() => onMove(file.path, 'script')}>Restore to Script</button>
                )}
                <button className="btn danger" disabled={busy} onClick={remove}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DateTimeField({ label, dotColor, date, time, onDate, onTime, onClear }: {
  label: string
  dotColor: string
  date: string
  time: string
  onDate: (v: string) => void
  onTime: (v: string) => void
  onClear: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="micro" style={{ color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
        {label}
      </label>
      <div style={{ display: 'flex', gap: 4 }}>
        <input type="date" className="input" value={date} onChange={e => onDate(e.target.value)} style={{ flex: 1.4, minWidth: 0, colorScheme: 'dark', padding: '5px 7px', fontSize: 11.5 }} />
        <input type="time" className="input" value={time} onChange={e => onTime(e.target.value)} style={{ flex: 1, minWidth: 0, colorScheme: 'dark', padding: '5px 7px', fontSize: 11.5 }} />
        <button className="btn tiny ghost" title={`Clear ${label.toLowerCase()}`} onClick={onClear} style={{ padding: '2px 7px' }}>✕</button>
      </div>
    </div>
  )
}

function AutoTextarea({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      rows={6}
      style={{
        width: '100%', resize: 'none', overflow: 'hidden',
        background: 'transparent', border: 'none', outline: 'none',
        color: 'var(--text-2)', fontFamily: 'var(--font-sans)',
        fontSize: 13, lineHeight: 1.65, minHeight: 160,
      }}
    />
  )
}
