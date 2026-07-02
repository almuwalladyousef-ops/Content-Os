'use client'

import { useRef, useState, useEffect } from 'react'
import { upload } from '@vercel/blob/client'
import StatusDot from '@/components/StatusDot'
import {
  IconUpload, IconFilm, IconX, IconArrowRight, IconClock,
  IconSparkles, LogoYouTube, PlatformIcon,
} from '@/components/Icons'
import { PostStatus } from '@/lib/types'

type Platform = 'youtube' | 'instagram' | 'tiktok'
type VideoType = 'short' | 'long'

interface PlatStatus { state: PostStatus; message: string }
const initialStatus = (): Record<Platform, PlatStatus> => ({
  youtube:   { state: 'idle', message: '' },
  instagram: { state: 'idle', message: '' },
  tiktok:    { state: 'idle', message: '' },
})

async function safeJson(res: Response) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 30, height: 18, borderRadius: 999, padding: 2,
        background: checked ? 'var(--accent)' : 'var(--surface-3)',
        display: 'flex',
        boxShadow: checked ? '0 0 8px var(--accent-glow)' : 'none',
        transition: 'all 180ms ease',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: 999,
        background: checked ? 'oklch(0.18 0.013 255)' : 'var(--text-mute)',
        marginLeft: checked ? 'auto' : 0,
        transition: 'all 180ms cubic-bezier(0.2, 0.7, 0.2, 1)',
      }} />
    </button>
  )
}

// ── Privacy radio ─────────────────────────────────────────────────────────────
function PrivacyRadio({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: (string | [string, string])[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {options.map(opt => {
        const val = Array.isArray(opt) ? opt[0] : opt
        const label = Array.isArray(opt) ? opt[1] : opt
        const active = value === val
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 8, textAlign: 'left', width: '100%',
              background: active ? 'var(--accent-dim)' : 'transparent',
              border: `1px solid ${active ? 'oklch(0.80 0.16 80 / 0.4)' : 'transparent'}`,
              transition: 'background 120ms ease',
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: 999, flexShrink: 0,
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
              display: 'grid', placeItems: 'center',
              background: active ? 'var(--accent)' : 'transparent',
            }}>
              {active && <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--bg)' }} />}
            </span>
            <span style={{ fontSize: 13, textTransform: 'capitalize', color: active ? 'var(--text)' : 'var(--text-dim)', fontWeight: active ? 500 : 400 }}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Platform toggle card ──────────────────────────────────────────────────────
const PLATFORM_META = {
  youtube:   { name: 'YouTube',   color: 'oklch(0.68 0.21 25)' },
  instagram: { name: 'Instagram', color: 'oklch(0.70 0.20 340)' },
  tiktok:    { name: 'TikTok',    color: 'oklch(0.85 0.15 200)' },
}

function PlatformToggle({ platform, enabled, locked, onToggle, detail }: {
  platform: Platform; enabled: boolean; locked: boolean
  onToggle: () => void; detail: string
}) {
  const meta = PLATFORM_META[platform]
  return (
    <button
      onClick={onToggle}
      disabled={locked}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 10,
        background: enabled ? 'var(--bg-2)' : 'oklch(0.155 0.012 255 / 0.4)',
        border: `1px solid ${enabled ? 'var(--border-strong)' : 'var(--hairline)'}`,
        opacity: locked ? 0.35 : enabled ? 1 : 0.55,
        textAlign: 'left', transition: 'all 120ms ease',
        cursor: locked ? 'not-allowed' : 'pointer',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: enabled ? `oklch(from ${meta.color} l c h / 0.15)` : 'var(--surface-2)',
        color: enabled ? meta.color : 'var(--text-mute)',
        display: 'grid', placeItems: 'center',
        border: `1px solid ${enabled ? `oklch(from ${meta.color} l c h / 0.4)` : 'var(--hairline)'}`,
      }}>
        <PlatformIcon platform={platform} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: enabled ? 'var(--text)' : 'var(--text-mute)' }}>{meta.name}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {locked ? 'unavailable' : detail}
        </div>
      </div>
      {!locked && (
        <div onClick={e => e.stopPropagation()}>
          <Toggle checked={enabled} onChange={() => onToggle()} />
        </div>
      )}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PostPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [videoType, setVideoType] = useState<VideoType>('short')
  const [caption, setCaption] = useState('')
  const [ytCaption, setYtCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [enabled, setEnabled] = useState({ youtube: true, instagram: true, tiktok: true })
  const [privacy, setPrivacy] = useState('public')
  // Unaudited TikTok apps can only post privately (SELF_ONLY); default to that
  // so posting works out of the box. Switch to Public once your app is audited.
  const [ttPrivacy, setTtPrivacy] = useState('SELF_ONLY')
  const [statuses, setStatuses] = useState<Record<Platform, PlatStatus>>(initialStatus())
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [suggestingCaptions, setSuggestingCaptions] = useState(false)
  const [suggestingHashtags, setSuggestingHashtags] = useState(false)
  const [suggestingYtTitle, setSuggestingYtTitle] = useState(false)
  const [suggestedCaptions, setSuggestedCaptions] = useState<string[]>([])
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([])
  const [suggestedYtTitles, setSuggestedYtTitles] = useState<string[]>([])
  // Scheduling
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduledMsg, setScheduledMsg] = useState('')

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__uploadRunning = running
    if (!running) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [running])

  function togglePlatform(p: Platform) {
    if (videoType === 'long' && p !== 'youtube') return
    setEnabled(e => ({ ...e, [p]: !e[p] }))
  }

  function selectVideoType(nextType: VideoType) {
    setVideoType(nextType)
    setEnabled(nextType === 'long'
      ? { youtube: true, instagram: false, tiktok: false }
      : { youtube: true, instagram: true, tiktok: true }
    )
  }

  function setStatus(p: Platform, state: PostStatus, message = '') {
    setStatuses(s => ({ ...s, [p]: { state, message } }))
  }
  function setAllStatus(state: PostStatus, message = '') {
    setStatuses({ youtube: { state, message }, instagram: { state, message }, tiktok: { state, message } })
  }

  type PlatResult = { success: true; url?: string } | { success: false; error: string }

  async function postYouTube(blobUrl: string): Promise<{ url: string | null; result: PlatResult }> {
    if (!file) return { url: null, result: { success: false, error: 'No file' } }
    setStatus('youtube', 'uploading', 'posting to YouTube...')
    const res = await fetch('/api/post/youtube', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl, title: ytCaption || file.name.replace(/\.[^.]+$/, ''), description: ytCaption, privacy, size: file.size, type: file.type || 'video/mp4' }),
    })
    const data = await safeJson(res)
    if (data.error) { setStatus('youtube', 'failed', data.error); return { url: null, result: { success: false, error: data.error } } }
    setStatus('youtube', 'success')
    return { url: data.videoUrl ?? null, result: { success: true, url: data.videoUrl ?? undefined } }
  }

  async function postInstagram(blobUrl: string): Promise<{ url: string | null; result: PlatResult }> {
    if (!file) return { url: null, result: { success: false, error: 'No file' } }
    setStatus('instagram', 'uploading', 'posting to Instagram...')
    const captionWithTags = caption + (hashtags.length ? '\n\n' + hashtags.join(' ') : '')
    const res = await fetch('/api/post/instagram', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: blobUrl, caption: captionWithTags }),
    })
    const data = await safeJson(res)
    if (data.error) { setStatus('instagram', 'failed', data.error); return { url: null, result: { success: false, error: data.error } } }
    setStatus('instagram', 'success')
    return { url: data.postUrl ?? null, result: { success: true, url: data.postUrl ?? undefined } }
  }

  async function postTikTok(blobUrl: string): Promise<{ url: null; result: PlatResult }> {
    if (!file) return { url: null, result: { success: false, error: 'No file' } }
    setStatus('tiktok', 'uploading', 'posting to TikTok...')
    const captionWithTags = caption + (hashtags.length ? '\n\n' + hashtags.join(' ') : '')
    const res = await fetch('/api/post/tiktok', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl, caption: captionWithTags, privacy: ttPrivacy, size: file.size }),
    })
    const data = await safeJson(res)
    if (data.error) { setStatus('tiktok', 'failed', data.error); return { url: null, result: { success: false, error: data.error } } }
    setStatus('tiktok', 'success')
    return { url: null, result: { success: true } }
  }

  async function suggestCaptions() {
    setSuggestingCaptions(true)
    try {
      const res = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'captions', context: caption || undefined }) })
      const data = await res.json()
      if (data.captions) setSuggestedCaptions(data.captions)
    } catch {}
    setSuggestingCaptions(false)
  }

  async function suggestHashtags() {
    setSuggestingHashtags(true)
    try {
      const res = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'hashtags', context: caption || undefined }) })
      const data = await res.json()
      if (data.hashtags) setSuggestedHashtags(data.hashtags)
    } catch {}
    setSuggestingHashtags(false)
  }

  async function suggestYtTitle() {
    setSuggestingYtTitle(true)
    try {
      const res = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'youtube_title', context: caption || undefined }) })
      const data = await res.json()
      if (data.titles) setSuggestedYtTitles(data.titles)
    } catch {}
    setSuggestingYtTitle(false)
  }

  async function handlePostAll() {
    if (!file) return
    setRunning(true)
    setAllStatus('uploading', 'uploading...')
    let blobUrl: string
    try {
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      let lastPct = -1
      const blob = await upload(safeName, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        onUploadProgress: ({ percentage }: { percentage: number }) => {
          const pct = Math.round(percentage)
          if (pct >= lastPct + 5 || pct === 100) { lastPct = pct; setAllStatus('uploading', `uploading ${pct}%...`) }
        },
      })
      blobUrl = blob.url
      setAllStatus('uploading', 'sending to platforms...')
    } catch (e) {
      setAllStatus('failed', `Upload failed: ${String(e)}`); setRunning(false); return
    }

    const errResult = (e: unknown, p: Platform): { url: null; result: PlatResult } => {
      setStatus(p, 'failed', String(e)); return { url: null, result: { success: false, error: String(e) } }
    }

    const promises: Promise<{ url: string | null; result: PlatResult } | { url: null; result: PlatResult }>[] = []
    if (enabled.youtube)   promises.push(postYouTube(blobUrl).catch(e => errResult(e, 'youtube')))
    else { setStatus('youtube', 'skipped'); promises.push(Promise.resolve({ url: null, result: { success: false, error: 'skipped' } })) }
    if (enabled.instagram) promises.push(postInstagram(blobUrl).catch(e => errResult(e, 'instagram')))
    else { setStatus('instagram', 'skipped'); promises.push(Promise.resolve({ url: null, result: { success: false, error: 'skipped' } })) }
    if (enabled.tiktok)    promises.push(postTikTok(blobUrl).catch(e => errResult(e, 'tiktok')))
    else { setStatus('tiktok', 'skipped'); promises.push(Promise.resolve({ url: null, result: { success: false, error: 'skipped' } })) }

    const [yt, ig, tt] = await Promise.all(promises)
    const ytUrl = yt.url; const igUrl = ig.url

    fetch('/api/blob/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: blobUrl }) }).catch(() => {})
    fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoName: file.name, results: { youtube: yt.result, instagram: ig.result, tiktok: tt.result } }) }).catch(() => {})

    const platforms: Platform[] = []
    if (ytUrl) platforms.push('youtube')
    if (igUrl) platforms.push('instagram')
    if (platforms.length > 0 || ytUrl || igUrl) {
      await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', entry: { id: crypto.randomUUID(), date: new Date().toISOString(), video_name: file.name, platforms, caption, youtube_url: ytUrl ?? undefined, instagram_url: igUrl ?? undefined } }) }).catch(() => {})
    }
    setRunning(false)
  }

  function openSchedule() {
    if (!file || enabledCount === 0) return
    // Default to ~1 hour from now, rounded to the next 5 minutes.
    const d = new Date(Date.now() + 60 * 60 * 1000)
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    setScheduleDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    setScheduleTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)
    setScheduledMsg('')
    setScheduleOpen(true)
  }

  async function handleSchedule() {
    if (!file || !scheduleDate || !scheduleTime) return
    const when = new Date(`${scheduleDate}T${scheduleTime}`)
    if (isNaN(when.getTime())) { setScheduledMsg('Pick a valid date and time'); return }
    if (when.getTime() < Date.now() - 60_000) { setScheduledMsg('That time is in the past'); return }

    setScheduling(true)
    setScheduledMsg('Uploading video…')
    try {
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      let lastPct = -1
      const blob = await upload(safeName, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        onUploadProgress: ({ percentage }: { percentage: number }) => {
          const pct = Math.round(percentage)
          if (pct >= lastPct + 5 || pct === 100) { lastPct = pct; setScheduledMsg(`Uploading ${pct}%…`) }
        },
      })

      setScheduledMsg('Saving schedule…')
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: when.toISOString(),
          videoType,
          platforms: enabled,
          blobUrl: blob.url,
          fileName: file.name,
          size: file.size,
          type: file.type || 'video/mp4',
          caption,
          ytCaption,
          hashtags,
          privacy,
          ttPrivacy,
        }),
      })
      const data = await safeJson(res)
      if (data.error) { setScheduledMsg(data.error); setScheduling(false); return }

      const niceWhen = when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      setScheduling(false)
      setScheduleOpen(false)
      setScheduledMsg('')
      setStatuses(initialStatus())
      // Surface confirmation in the action bar.
      ;(window as unknown as Record<string, unknown>).__lastScheduled = niceWhen
      alert(`Scheduled for ${niceWhen}. It will post automatically and appear in Content OS under "Scheduled".`)
      setFile(null)
    } catch (e) {
      setScheduledMsg(`Schedule failed: ${String(e)}`)
      setScheduling(false)
    }
  }

  const enabledCount = Object.values(enabled).filter(Boolean).length
  const successCount = Object.values(statuses).filter(s => s.state === 'success').length
  const allPosted = successCount === enabledCount && enabledCount > 0 && Object.values(statuses).some(s => s.state === 'success')

  function addTag(raw: string) {
    let t = raw.trim().replace(/\s+/g, '')
    if (!t) return
    if (!t.startsWith('#')) t = `#${t}`
    setHashtags(prev => prev.includes(t) ? prev : [...prev, t])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('video/')) setFile(f)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="micro" style={{ marginBottom: 4 }}>Compose</div>
            <h1 className="h1">New post</h1>
          </div>
          <span className="pill"><IconClock size={11} /> drafted just now</span>
        </div>

        {/* Video type switch */}
        <div className="card" style={{ padding: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {([
              { id: 'short', label: 'Short-form', sub: 'under 60s · vertical · all platforms', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 7h2" /></svg> },
              { id: 'long',  label: 'Long-form',  sub: '1+ min · horizontal · YouTube',        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M10 10l5 2-5 2z" fill="currentColor" stroke="none" /></svg> },
            ] as { id: VideoType; label: string; sub: string; icon: React.ReactNode }[]).map(t => {
              const active = videoType === t.id
              return (
                <button key={t.id} onClick={() => selectVideoType(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                  background: active ? 'var(--surface-2)' : 'transparent',
                  border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
                  textAlign: 'left', transition: 'all 140ms ease', position: 'relative',
                }}>
                  {active && <span style={{ position: 'absolute', left: 8, top: 12, bottom: 12, width: 2, background: 'var(--accent)', borderRadius: 999, boxShadow: '0 0 8px var(--accent-glow)' }} />}
                  <span style={{
                    width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center',
                    background: active ? 'var(--accent-dim)' : 'var(--bg-2)',
                    color: active ? 'var(--accent)' : 'var(--text-dim)',
                    border: `1px solid ${active ? 'oklch(0.80 0.16 80 / 0.4)' : 'var(--hairline)'}`,
                    marginLeft: active ? 6 : 0, transition: 'all 140ms ease',
                  }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: active ? 'var(--text)' : 'var(--text-dim)' }}>{t.label}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2 }}>{t.sub}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Drop zone */}
        <div className="card" style={{ padding: 'var(--pad-sm)' }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
            style={{
              height: videoType === 'long' ? 140 : 180, borderRadius: 'var(--radius)',
              border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              background: dragging ? 'var(--accent-dim)' : 'var(--bg-2)',
              transition: 'all 180ms ease', cursor: file ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
            {!file ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', border: '1px solid var(--border)', color: dragging ? 'var(--accent)' : 'var(--text-2)', transition: 'color 120ms ease' }}>
                  <IconUpload size={20} />
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>Drop video here, or click to browse</div>
                <div className="micro">.mp4 .mov .webm · up to 256MB</div>
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', gap: 16, padding: 16 }}>
                <div style={{ width: 100, height: '100%', borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-dim), var(--surface-3))', display: 'grid', placeItems: 'center', border: '1px solid var(--border)', flexShrink: 0 }}>
                  <IconFilm size={28} style={{ color: 'var(--text-dim)' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, wordBreak: 'break-all' }}>{file.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type || 'video/mp4'}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="pill ok" style={{ height: 20, fontSize: 10 }}><span className="dot" />ready</span>
                    <button className="btn ghost tiny" onClick={e => { e.stopPropagation(); setFile(null) }}>Change</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Caption */}
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="micro">{videoType === 'long' ? 'Short summary (IG · TT)' : 'Caption'}</span>
            <span className="mono" style={{ fontSize: 10.5, color: caption.length > 2200 ? 'var(--bad)' : 'var(--text-mute)' }}>
              {caption.length}<span style={{ color: 'var(--text-mute)' }}> / 2200</span>
            </span>
          </div>
          <textarea className="textarea" rows={videoType === 'long' ? 3 : 5} placeholder="Write once, post everywhere…" value={caption} onChange={e => setCaption(e.target.value)} style={{ fontSize: 14 }} />

          {/* YouTube Title */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="micro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LogoYouTube size={12} /> YouTube Title</span>
              <span className="mono" style={{ fontSize: 10.5, color: ytCaption.length > 60 ? 'var(--bad)' : 'var(--text-mute)' }}>{ytCaption.length} / 60</span>
            </div>
            <textarea className="textarea" rows={2} maxLength={60} placeholder="YouTube video title…" value={ytCaption} onChange={e => setYtCaption(e.target.value)} style={{ fontSize: 14 }} />
          </div>

          {/* Active hashtags (from suggestions) */}
          {hashtags.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hashtags.map(tag => (
                <button key={tag} onClick={() => setHashtags(prev => prev.filter(t => t !== tag))} className="mono" style={{ fontSize: 11, padding: '4px 8px 4px 10px', borderRadius: 6, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid oklch(0.80 0.16 80 / 0.3)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Click to remove">
                  {tag} <IconX size={10} style={{ opacity: 0.6 }} />
                </button>
              ))}
            </div>
          )}

          {/* Gemini AI suggestions */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <IconSparkles size={12} style={{ color: 'var(--accent)' }} /> GEMINI ·
            </span>
            <button className="btn ghost tiny" onClick={suggestCaptions} disabled={suggestingCaptions} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <IconSparkles size={11} />
              {suggestingCaptions ? 'generating…' : 'suggest captions'}
            </button>
            <button className="btn ghost tiny" onClick={suggestHashtags} disabled={suggestingHashtags} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <IconSparkles size={11} />
              {suggestingHashtags ? 'generating…' : 'suggest hashtags'}
            </button>
            <button className="btn ghost tiny" onClick={suggestYtTitle} disabled={suggestingYtTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <LogoYouTube size={11} />
              {suggestingYtTitle ? 'generating…' : 'suggest youtube title'}
            </button>
          </div>

          {/* Suggested captions */}
          {suggestedCaptions.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="micro">Suggested captions — click to use</span>
              {suggestedCaptions.map((c, i) => (
                <button key={i} onClick={() => { setCaption(c); setSuggestedCaptions([]) }} style={{
                  padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                  background: 'var(--bg-2)', border: '1px solid var(--hairline)',
                  fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5,
                  transition: 'background 120ms ease',
                }}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Suggested hashtags */}
          {suggestedHashtags.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="micro">Suggested hashtags — click to add</span>
                <button className="btn ghost tiny" onClick={() => setSuggestedHashtags([])}>dismiss</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {suggestedHashtags.map(tag => (
                  <button key={tag} onClick={() => { addTag(tag); setSuggestedHashtags(prev => prev.filter(t => t !== tag)) }} className="mono" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'background 120ms ease' }}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggested YouTube titles */}
          {suggestedYtTitles.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                <span className="micro">Suggested YouTube titles — click to use</span>
                <button className="btn ghost tiny" onClick={() => setSuggestedYtTitles([])}>dismiss</button>
              </div>
              {suggestedYtTitles.map((t, i) => (
                <button key={i} onClick={() => { setYtCaption(t.slice(0, 60)); setSuggestedYtTitles([]) }} style={{
                  padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                  background: 'var(--bg-2)', border: '1px solid var(--hairline)',
                  fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5,
                  transition: 'background 120ms ease',
                }}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Platform toggles */}
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="micro">Destinations</div>
            {videoType === 'long' && <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>long-form · YouTube only</span>}
          </div>
          <div className="platform-grid-3" style={{ gap: 12 }}>
            <PlatformToggle platform="youtube"   enabled={enabled.youtube}   locked={false}                        onToggle={() => togglePlatform('youtube')}   detail={`${videoType === 'long' ? 'Video' : 'Shorts'} · ${privacy}`} />
            <PlatformToggle platform="instagram" enabled={enabled.instagram} locked={videoType === 'long'}          onToggle={() => togglePlatform('instagram')} detail="public" />
            <PlatformToggle platform="tiktok"    enabled={enabled.tiktok}    locked={videoType === 'long'}          onToggle={() => togglePlatform('tiktok')}    detail={ttPrivacy === 'PUBLIC_TO_EVERYONE' ? 'public' : ttPrivacy === 'FOLLOWER_OF_CREATOR' ? 'followers' : 'only me'} />
          </div>

          {/* Privacy details */}
          <div className="privacy-grid-3" style={{ marginTop: 16, gap: 14 }}>
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--hairline)', opacity: enabled.youtube ? 1 : 0.4 }}>
              <div className="micro" style={{ marginBottom: 8 }}>YouTube</div>
              <PrivacyRadio value={privacy} onChange={setPrivacy} options={['public', 'unlisted', 'private']} />
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--hairline)', opacity: enabled.instagram ? 1 : 0.4 }}>
              <div className="micro" style={{ marginBottom: 8 }}>Instagram</div>
              <div style={{ color: 'var(--text-mute)', fontSize: 12, fontStyle: 'italic', padding: '8px 4px' }}>
                {videoType === 'long' ? 'Long-form not supported.' : 'Reels are always public via API.'}
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--hairline)', opacity: enabled.tiktok ? 1 : 0.4 }}>
              <div className="micro" style={{ marginBottom: 8 }}>TikTok</div>
              {videoType === 'long' ? (
                <div style={{ color: 'var(--text-mute)', fontSize: 12, fontStyle: 'italic', padding: '8px 4px' }}>Long-form not supported.</div>
              ) : (
                <>
                  <PrivacyRadio value={ttPrivacy} onChange={setTtPrivacy} options={[['PUBLIC_TO_EVERYONE', 'Public'], ['FOLLOWER_OF_CREATOR', 'Followers'], ['SELF_ONLY', 'Only me']]} />
                  {ttPrivacy !== 'SELF_ONLY' && (
                    <div style={{ color: 'var(--text-mute)', fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
                      Public/Followers needs your TikTok app to pass audit. Unaudited apps can only post “Only me”.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status panel */}
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="micro" style={{ marginBottom: 8 }}>Post status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatusDot platform="youtube"   state={statuses.youtube.state}   message={statuses.youtube.message} />
            <StatusDot platform="instagram" state={statuses.instagram.state} message={statuses.instagram.message} />
            <StatusDot platform="tiktok"    state={statuses.tiktok.state}    message={statuses.tiktok.message} />
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="card post-actions" style={{ padding: 'var(--pad-sm)', gap: 12, position: 'sticky', bottom: 16, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          {running ? (
            <span className="pill warn"><span className="dot" /> posting · {successCount}/{enabledCount} done</span>
          ) : allPosted ? (
            <span className="pill ok"><span className="dot" /> posted to {enabledCount} platform{enabledCount !== 1 ? 's' : ''}</span>
          ) : (
            <span className="pill"><span className="dot" /> {enabledCount} platform{enabledCount !== 1 ? 's' : ''} selected</span>
          )}
          <div className="post-actions-buttons" style={{ marginLeft: 'auto', alignItems: 'center', gap: 8 }}>
            <button className="btn ghost" disabled={running}>Save as draft</button>
            <button className="btn ghost" disabled={running || scheduling || !file || enabledCount === 0} onClick={openSchedule}><IconClock size={14} /> Schedule</button>
            <button className="btn primary big" disabled={!file || running || enabledCount === 0} onClick={handlePostAll}>
              {running ? (
                <><span style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 700ms linear infinite', display: 'inline-block' }} /> Posting…</>
              ) : (
                <>Post to {enabledCount} <IconArrowRight size={15} /></>
              )}
            </button>
          </div>
        </div>

        {/* Schedule modal */}
        {scheduleOpen && (
          <div
            onClick={() => !scheduling && setScheduleOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(4px)',
              display: 'grid', placeItems: 'center', padding: 16,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="card"
              style={{ width: '100%', maxWidth: 380, padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div>
                <div className="micro" style={{ marginBottom: 4 }}>Auto-post</div>
                <h2 className="h1" style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconClock size={18} /> Schedule this post
                </h2>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="micro">Date</span>
                  <input type="date" className="textarea" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ fontSize: 14, padding: '9px 10px' }} />
                </label>
                <label style={{ width: 130, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="micro">Time</span>
                  <input type="time" className="textarea" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ fontSize: 14, padding: '9px 10px' }} />
                </label>
              </div>

              <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>
                Posts to {enabledCount} platform{enabledCount !== 1 ? 's' : ''} at the chosen time and shows in Content OS under <span style={{ color: 'var(--text-2)' }}>Scheduled</span>. Keep Content OS running so it can fire.
              </div>

              {scheduledMsg && (
                <div className="mono" style={{ fontSize: 11.5, color: scheduling ? 'var(--text-2)' : 'var(--bad)' }}>{scheduledMsg}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                <button className="btn ghost" disabled={scheduling} onClick={() => setScheduleOpen(false)}>Cancel</button>
                <button className="btn primary" disabled={scheduling || !scheduleDate || !scheduleTime} onClick={handleSchedule}>
                  {scheduling ? (
                    <><span style={{ width: 13, height: 13, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 700ms linear infinite', display: 'inline-block' }} /> Scheduling…</>
                  ) : (
                    <>Schedule <IconArrowRight size={14} /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  )
}
