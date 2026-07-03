'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ACCOUNT_META, BOARD_COLUMNS, Card, CardStatus, FORMAT_META,
  RESEARCH_BUCKETS, ResearchBucket, accountForList, accountLabel, apiCreate,
  apiDelete, apiScan, apiWrite, buildFilePath, buildTemplate, enrich,
  formatLabel, graphLinksFor, isContent, isResearchItem, pathForCard,
  statusLabel, toSlug, withGraphLinks, writeFM, isHubFile,
} from '@/lib/board/model'
import FileEditor from './FileEditor'
import CalendarView from './CalendarView'

type View = 'board' | 'calendar' | 'research' | 'archive'

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
}

export default function BoardApp() {
  const [files, setFiles] = useState<Card[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'no-vault'>('loading')
  const [view, setView] = useState<View>('board')
  const [acc, setAcc] = useState('all')
  const [fmt, setFmt] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Card | null>(null)
  const [creating, setCreating] = useState<CardStatus | null>(null)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const dragPath = useRef<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const say = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await apiScan()
      if ('error' in res) { setState('offline'); return }
      if ('needsVault' in res) { setState('no-vault'); return }
      setFiles(res.map(enrich))
      setState('ready')
    } catch {
      setState('offline')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const matches = useCallback((f: Card) => {
    if (acc !== 'all' && f.account !== acc) return false
    if (fmt !== 'all' && f.format !== fmt) return false
    if (q && !(f.title + ' ' + (f.data.summary || '') + ' ' + f.body).toLowerCase().includes(q.toLowerCase())) return false
    return true
  }, [acc, fmt, q])

  const boardCards = useMemo(
    () => files.filter(f => isContent(f) && f.status !== 'archive' && matches(f)),
    [files, matches],
  )
  const researchCards = useMemo(
    () => files.filter(f => isResearchItem(f) && matches(f)),
    [files, matches],
  )
  const archivedCards = useMemo(
    () => files.filter(f => !isHubFile(f) && f.status === 'archive' && matches(f)),
    [files, matches],
  )

  const moveCard = useCallback(async (path: string, newStatus: CardStatus) => {
    const f = files.find(x => x.path === path)
    if (!f || f.status === newStatus) return
    const previousLinks = newStatus === 'archive' ? graphLinksFor(f) : []
    const next: Card = { ...f, status: newStatus, rtype: null, data: { ...f.data, status: newStatus } }
    const newPath = pathForCard(next, newStatus)
    const content = writeFM(next.data, withGraphLinks(next.body, next, previousLinks))
    try {
      await apiCreate(newPath, content)
      if (f.path !== newPath) await apiDelete(f.path)
      say(`Moved to ${statusLabel(newStatus)}`)
      setSel(null)
      await load()
    } catch (e) {
      say('Move failed: ' + (e as Error).message, true)
    }
  }, [files, load, say])

  // Reschedule from the calendar: rewrite one frontmatter date field.
  const saveDate = useCallback(async (path: string, field: string, value: string) => {
    const f = files.find(x => x.path === path)
    if (!f || f.data[field] === value) return
    try {
      await apiWrite(path, writeFM({ ...f.data, [field]: value || null }, f.body))
      say(value ? `Moved to ${value}` : 'Date cleared')
      await load()
    } catch (e) {
      say('Reschedule failed: ' + (e as Error).message, true)
    }
  }, [files, load, say])

  const counts = useMemo(() => ({
    active: files.filter(f => isContent(f) && f.status !== 'archive').length,
    research: files.filter(isResearchItem).length,
    archived: files.filter(f => !isHubFile(f) && f.status === 'archive').length,
  }), [files])

  if (state === 'loading') {
    return <Centered><span className="dim">Loading vault…</span></Centered>
  }
  if (state === 'offline') {
    return (
      <Centered>
        <div style={{ ...card, padding: 'var(--pad)', maxWidth: 380, textAlign: 'center' }}>
          <div className="h3" style={{ marginBottom: 6 }}>Home server offline</div>
          <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
            The board reads your vault through the Mac mini. Start it, then try again.
          </p>
          <button className="btn" onClick={() => { setState('loading'); load() }}>Retry</button>
        </div>
      </Centered>
    )
  }
  if (state === 'no-vault') {
    return (
      <Centered>
        <div style={{ ...card, padding: 'var(--pad)', maxWidth: 380, textAlign: 'center' }}>
          <div className="h3" style={{ marginBottom: 6 }}>No vault folder selected</div>
          <p className="dim" style={{ fontSize: 13 }}>
            Pick your Content OS folder once on the Mac mini (open the old board there) and it will show up here.
          </p>
        </div>
      </Centered>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--gap)',
      height: '100%', minHeight: 0,
      // Board + calendar fit the viewport (columns/grid scroll internally);
      // research + archive scroll as normal pages.
      overflow: view === 'board' || view === 'calendar' ? 'hidden' : 'visible',
    }}>
      {/* Header — title left, view tabs in the middle, new card right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="h1">Board</h1>
          <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
            {counts.active} active · {counts.research} research · {counts.archived} archived
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 2, padding: 3,
          background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)',
          margin: '0 auto',
        }}>
          {(['board', 'calendar', 'research', 'archive'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12.5,
                fontWeight: view === v ? 500 : 400,
                color: view === v ? 'var(--text)' : 'var(--text-dim)',
                background: view === v ? 'var(--surface-2)' : 'transparent',
                border: `1px solid ${view === v ? 'var(--border)' : 'transparent'}`,
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setCreating(view === 'research' ? 'research' : 'script')}>
          + New card
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Chips
          items={[{ key: 'all', label: 'All accounts' }, ...ACCOUNT_META]}
          value={acc} onChange={setAcc}
        />
        <Chips
          items={[{ key: 'all', label: 'All formats' }, ...FORMAT_META]}
          value={fmt} onChange={setFmt}
        />

        <input
          className="input"
          placeholder="Search cards…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ marginLeft: 'auto', width: 200, padding: '7px 12px', fontSize: 12.5 }}
        />
      </div>

      {/* Views */}
      {view === 'board' && (
        <Kanban cards={boardCards} onSelect={setSel} onDrop={moveCard} onQuickAdd={setCreating} dragPath={dragPath} />
      )}
      {view === 'calendar' && (
        <CalendarView files={files.filter(f => !isHubFile(f))} onSelect={setSel} onReschedule={saveDate} />
      )}
      {view === 'research' && <Research cards={researchCards} onSelect={setSel} />}
      {view === 'archive' && <Archive cards={archivedCards} onSelect={setSel} onRestore={p => moveCard(p, 'script')} />}

      {/* Modals + toast */}
      {sel && (
        <FileEditor
          file={sel}
          onClose={() => setSel(null)}
          onMove={moveCard}
          onSaved={async (msg) => { setSel(null); say(msg); await load() }}
          onError={msg => say(msg, true)}
          onDeleted={async () => { setSel(null); say('Deleted'); await load() }}
        />
      )}
      {creating && (
        <NewCardModal
          initialStatus={creating}
          defaultAccount={acc === 'all' ? 'traceback' : acc}
          onClose={() => setCreating(null)}
          onCreated={async (status) => {
            setCreating(null)
            say('Created')
            setView(status === 'research' ? 'research' : 'board')
            await load()
          }}
          onError={msg => say(msg, true)}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 120,
          padding: '9px 18px', borderRadius: 999, fontSize: 12.5,
          background: toast.bad ? 'oklch(0.30 0.09 25)' : 'var(--surface-3)',
          border: `1px solid ${toast.bad ? 'oklch(0.45 0.12 25)' : 'var(--border-strong)'}`,
          boxShadow: '0 10px 30px oklch(0 0 0 / 0.4)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Kanban ───────────────────────────────────────────────────────────────────

function Kanban({ cards, onSelect, onDrop, onQuickAdd, dragPath }: {
  cards: Card[]
  onSelect: (f: Card) => void
  onDrop: (path: string, status: CardStatus) => void
  onQuickAdd: (status: CardStatus) => void
  dragPath: React.MutableRefObject<string | null>
}) {
  const [over, setOver] = useState<string | null>(null)

  const byStatus: Record<string, Card[]> = {}
  BOARD_COLUMNS.forEach(c => { byStatus[c.key] = [] })
  cards.forEach(f => { (byStatus[f.status || 'script'] ?? byStatus['script']).push(f) })

  // Columns always fit the page (no horizontal scroll); no surfaces — just a
  // header pill per column with the cards floating on the page background.
  return (
    <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
      {BOARD_COLUMNS.map(({ key, label, color }) => (
        <div
          key={key}
          onDragOver={e => { e.preventDefault(); setOver(key) }}
          onDragLeave={() => setOver(o => (o === key ? null : o))}
          onDrop={e => {
            e.preventDefault(); setOver(null)
            if (dragPath.current) onDrop(dragPath.current, key)
          }}
          style={{
            flex: '1 1 0', minWidth: 0,
            display: 'flex', flexDirection: 'column', gap: 10,
            borderRadius: 'var(--radius)',
            outline: over === key ? '1px dashed var(--accent)' : 'none',
            outlineOffset: 4,
          }}
        >
          {/* Column header pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 11px',
            background: 'var(--bg-2)',
            border: '1px solid var(--hairline)',
            borderRadius: 999,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: color, boxShadow: `0 0 8px ${color}` }} />
            <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-mute)' }}>
              {byStatus[key].length}
            </span>
          </div>

          {/* Free-floating cards */}
          <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, minHeight: 40 }}>
            {byStatus[key].map(f => (
              <div
                key={f.path}
                draggable
                onDragStart={() => { dragPath.current = f.path }}
                onDragEnd={() => { dragPath.current = null }}
                onClick={() => onSelect(f)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 11px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px oklch(0 0 0 / 0.18)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
              >
                <div style={{ fontSize: 12.5, lineHeight: 1.4, fontWeight: 450 }}>{f.title}</div>
                <CardTags f={f} />
              </div>
            ))}
            <button
              onClick={() => onQuickAdd(key)}
              className="mute"
              style={{ padding: '7px 4px', fontSize: 11.5, borderRadius: 8, border: '1px dashed var(--hairline)', width: '100%' }}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function CardTags({ f }: { f: Card }) {
  if (!f.account && !f.format) return null
  return (
    <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
      {f.account && <Tag accent>{accountLabel(f.account)}</Tag>}
      {f.format && <Tag>{formatLabel(f.format)}</Tag>}
    </div>
  )
}

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className="mono" style={{
      fontSize: 9.5, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.03em',
      color: accent ? 'var(--accent-2)' : 'var(--text-dim)',
      background: accent ? 'var(--accent-dim)' : 'var(--bg-2)',
      border: `1px solid ${accent ? 'oklch(0.80 0.16 80 / 0.25)' : 'var(--hairline)'}`,
    }}>
      {children}
    </span>
  )
}

// ── Research ─────────────────────────────────────────────────────────────────

function Research({ cards, onSelect }: { cards: Card[]; onSelect: (f: Card) => void }) {
  const accounts = cards.filter(f => f.rtype === 'accounts')
  return (
    <div className="scroll" style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <AccountsShelf accounts={accounts} onSelect={onSelect} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {RESEARCH_BUCKETS.map(bucket => {
          const items = cards.filter(f => (f.rtype || 'daily') === bucket.key)
          return (
            <div key={bucket.key} style={{ ...card, padding: 'var(--pad-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="h3">{bucket.label}</span>
                  <span className="mono dim" style={{ fontSize: 11 }}>{items.length}</span>
                </div>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>{bucket.purpose}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(f => <ResearchCard key={f.path} f={f} onSelect={onSelect} />)}
                {!items.length && <span className="mute" style={{ fontSize: 12 }}>Empty</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Accounts to study — profile-style cards grouped by which of your brands
 * they're useful for, with the handle, link, and format at a glance.
 */
function AccountsShelf({ accounts, onSelect }: { accounts: Card[]; onSelect: (f: Card) => void }) {
  const [filter, setFilter] = useState('all')
  const shown = filter === 'all' ? accounts : accounts.filter(f => accountForList(f).includes(filter))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="h3">Accounts to study</span>
        <span className="mono dim" style={{ fontSize: 11 }}>{shown.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[{ key: 'all', label: 'All' }, ...ACCOUNT_META].map(a => {
            const on = filter === a.key
            return (
              <button
                key={a.key}
                onClick={() => setFilter(a.key)}
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11,
                  color: on ? 'var(--accent-2)' : 'var(--text-dim)',
                  background: on ? 'var(--accent-dim)' : 'transparent',
                  border: `1px solid ${on ? 'oklch(0.80 0.16 80 / 0.35)' : 'var(--hairline)'}`,
                }}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      </div>

      {shown.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
          {shown.map(f => {
            const link = f.data.account_link || f.data.source || ''
            const domain = link ? link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null
            const usefulFor = accountForList(f).filter(k => ACCOUNT_META.some(a => a.key === k))
            const format = f.data.account_format || null
            return (
              <div
                key={f.path}
                onClick={() => onSelect(f)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '12px 14px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  transition: 'border-color 120ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.title}
                    </div>
                    {domain && (
                      <a
                        href={link!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="mono"
                        style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}
                      >
                        {domain} ↗
                      </a>
                    )}
                  </div>
                  {format && <Tag>{formatLabel(String(format))}</Tag>}
                </div>
                {usefulFor.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {usefulFor.map(k => <Tag key={k} accent>{accountLabel(k)}</Tag>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mute" style={{
          fontSize: 12.5, padding: '18px 0', textAlign: 'center',
          border: '1px dashed var(--hairline)', borderRadius: 'var(--radius)',
        }}>
          No accounts saved{filter !== 'all' ? ` for ${accountLabel(filter)}` : ''} yet.
        </div>
      )}
    </div>
  )
}

function ResearchCard({ f, onSelect }: { f: Card; onSelect: (f: Card) => void }) {
  return (
    <div
      onClick={() => onSelect(f)}
      style={{
        background: 'var(--surface-2)', border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)', padding: '10px 11px', cursor: 'pointer',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--hairline)' }}
    >
      <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{f.title}</div>
      <CardTags f={f} />
    </div>
  )
}

// ── Archive ──────────────────────────────────────────────────────────────────

function Archive({ cards, onSelect, onRestore }: {
  cards: Card[]
  onSelect: (f: Card) => void
  onRestore: (path: string) => void
}) {
  return (
    <div className="scroll" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ ...card, overflow: 'hidden' }}>
        {cards.map((f, i) => (
          <div
            key={f.path}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderTop: i ? '1px solid var(--hairline)' : 'none', cursor: 'pointer',
            }}
            onClick={() => onSelect(f)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{f.title}</div>
              <CardTags f={f} />
            </div>
            <button className="btn tiny" onClick={e => { e.stopPropagation(); onRestore(f.path) }}>
              Restore to Script
            </button>
          </div>
        ))}
        {!cards.length && <div className="dim" style={{ padding: 'var(--pad)', fontSize: 13, textAlign: 'center' }}>Archive is empty.</div>}
      </div>
    </div>
  )
}

// ── New-card modal ───────────────────────────────────────────────────────────

function NewCardModal({ initialStatus, defaultAccount, onClose, onCreated, onError }: {
  initialStatus: CardStatus
  defaultAccount: string
  onClose: () => void
  onCreated: (status: CardStatus) => void
  onError: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<CardStatus>(initialStatus)
  const [bucket, setBucket] = useState<ResearchBucket>('daily')
  const [account, setAccount] = useState(defaultAccount)
  const [format, setFormat] = useState('short-form')
  const [link, setLink] = useState('')
  const [context, setContext] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!title.trim()) { onError('Give it a title first'); return }
    setBusy(true)
    try {
      const content = buildTemplate({ title: title.trim(), account, format, status, bucket, link, context })
      const path = buildFilePath(toSlug(title), status, bucket)
      await apiCreate(path, content)
      onCreated(status)
    } catch (e) {
      onError('Create failed: ' + (e as Error).message)
      setBusy(false)
    }
  }

  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }

  return (
    <Modal onClose={onClose} width={520}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="h2">New card</div>
        <button className="btn tiny ghost" onClick={onClose}>✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        <div style={field}>
          <label className="micro">Title</label>
          <input className="input" autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create() }} placeholder="What's the idea?" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={field}>
            <label className="micro">Stage</label>
            <select className="input" value={status} onChange={e => setStatus(e.target.value as CardStatus)}>
              <option value="research">Research</option>
              {BOARD_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {status === 'research' ? (
            <div style={field}>
              <label className="micro">Bucket</label>
              <select className="input" value={bucket} onChange={e => setBucket(e.target.value as ResearchBucket)}>
                {RESEARCH_BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
          ) : (
            <div style={field}>
              <label className="micro">Format</label>
              <select className="input" value={format} onChange={e => setFormat(e.target.value)}>
                {FORMAT_META.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={field}>
          <label className="micro">Account</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {ACCOUNT_META.map(a => (
              <button
                key={a.key}
                onClick={() => setAccount(a.key)}
                className="btn tiny"
                style={account === a.key ? {
                  background: 'var(--accent-dim)', borderColor: 'oklch(0.80 0.16 80 / 0.4)', color: 'var(--accent-2)',
                } : undefined}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div style={field}>
          <label className="micro">Link (optional)</label>
          <input className="input" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" />
        </div>

        <div style={field}>
          <label className="micro">Notes (optional)</label>
          <textarea className="textarea" value={context} onChange={e => setContext(e.target.value)} rows={3} placeholder="Context, angle, why it works…" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create card'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Chips({ items, value, onChange }: {
  items: { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {items.map(it => {
        const on = value === it.key
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            style={{
              padding: '5px 11px', borderRadius: 999, fontSize: 11.5,
              color: on ? 'var(--accent-2)' : 'var(--text-dim)',
              background: on ? 'var(--accent-dim)' : 'transparent',
              border: `1px solid ${on ? 'oklch(0.80 0.16 80 / 0.35)' : 'var(--hairline)'}`,
              transition: 'all 120ms ease',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

function Modal({ children, onClose, width = 640 }: {
  children: React.ReactNode
  onClose: () => void
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'oklch(0 0 0 / 0.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="scroll anim-up"
        style={{
          ...card,
          background: 'oklch(0.185 0.013 255)',
          width: '100%', maxWidth: width, maxHeight: '86vh', overflowY: 'auto',
          padding: 'var(--pad)',
          boxShadow: '0 24px 60px oklch(0 0 0 / 0.5)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 320 }}>{children}</div>
}
