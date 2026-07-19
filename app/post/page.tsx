'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadMedia, deleteMedia } from '@/lib/media-upload'
import StatusDot from '@/components/StatusDot'
import {
  IconUpload, IconX, IconArrowRight,
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

// Platform destination row
const PLATFORM_META = {
  youtube:   { name: 'YouTube',   color: 'oklch(0.68 0.21 25)' },
  instagram: { name: 'Instagram', color: 'oklch(0.70 0.20 340)' },
  tiktok:    { name: 'TikTok',    color: 'oklch(0.85 0.15 200)' },
}

function PlatformToggle({ platform, enabled, locked, onToggle, detail, children }: {
  platform: Platform; enabled: boolean; locked: boolean
  onToggle: () => void; detail: string; children: React.ReactNode
}) {
  const meta = PLATFORM_META[platform]
  return (
    <div className={`post-platform-row${enabled ? ' selected' : ''}${locked ? ' locked' : ''}`}>
      <button
        type="button"
        className="post-platform-main"
        disabled={locked}
        aria-pressed={enabled}
        onClick={onToggle}
      >
        <span className="post-platform-check" aria-hidden="true">
          {enabled && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 4 4L19 6" />
            </svg>
          )}
        </span>
        <span className="post-platform-icon" style={{ color: enabled ? meta.color : 'var(--text-mute)' }}>
          <PlatformIcon platform={platform} size={17} />
        </span>
        <span className="post-platform-copy">
          <span className="post-platform-name">{meta.name}</span>
          <span className="mono post-platform-detail">{locked ? 'Long-form unavailable' : detail}</span>
        </span>
      </button>
      <div className="post-platform-setting">{children}</div>
    </div>
  )
}

// Main page
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
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

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
    if (data.draft) {
      setStatus('tiktok', 'success', 'sent as a draft. Open TikTok; it is in your inbox and ready to post')
      return { url: null, result: { success: true } }
    }
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
    let fileKey: string
    try {
      let lastPct = -1
      const uploaded = await uploadMedia(file, (pct) => {
        if (pct >= lastPct + 5 || pct === 100) { lastPct = pct; setAllStatus('uploading', `uploading ${pct}%...`) }
      })
      blobUrl = uploaded.url
      fileKey = uploaded.key
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

    deleteMedia(fileKey)
    fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoName: file.name, results: { youtube: yt.result, instagram: ig.result, tiktok: tt.result } }) }).catch(() => {})

    const platforms: Platform[] = []
    if (ytUrl) platforms.push('youtube')
    if (igUrl) platforms.push('instagram')
    if (platforms.length > 0) {
      await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', entry: { id: crypto.randomUUID(), date: new Date().toISOString(), video_name: file.name, platforms, caption, youtube_url: ytUrl ?? undefined, instagram_url: igUrl ?? undefined } }) }).catch(() => {})
    }
    setRunning(false)
  }

  function openSchedule() {
    if (scheduleDate && scheduleTime) {
      setScheduledMsg('')
      setScheduleOpen(true)
      return
    }
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
    setScheduledMsg('Uploading video...')
    try {
      let lastPct = -1
      const uploaded = await uploadMedia(file, (pct) => {
        if (pct >= lastPct + 5 || pct === 100) { lastPct = pct; setScheduledMsg(`Uploading ${pct}%...`) }
      })

      setScheduledMsg('Saving schedule...')
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: when.toISOString(),
          videoType,
          platforms: enabled,
          blobUrl: uploaded.url,
          fileKey: uploaded.key,
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

  function clearComposer() {
    setFile(null)
    setCaption('')
    setYtCaption('')
    setHashtags([])
    setSuggestedCaptions([])
    setSuggestedHashtags([])
    setSuggestedYtTitles([])
    setStatuses(initialStatus())
    setScheduledMsg('')
  }

  const isBusy = running || scheduling
  const hasComposerContent = Boolean(file || caption || ytCaption || hashtags.length)

  return (
    <div className="post-page">
      <header className="post-page-header">
        <div>
          <div className="micro">Compose</div>
          <h1 className="h1">New post</h1>
        </div>
        <span className={'pill' + (allPosted ? ' ok' : '')}>
          <span className="dot" />
          {allPosted ? 'Posted to ' + enabledCount : file ? 'Media ready' : 'Not published'}
        </span>
      </header>

      <div className="post-format-switch" aria-label="Video format">
        {([
          { id: 'short', label: 'Short-form', sub: 'Under 60s · vertical · all platforms', icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 7h2" /></svg> },
          { id: 'long', label: 'Long-form', sub: '1+ min · horizontal · YouTube', icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M10 10l5 2-5 2z" fill="currentColor" stroke="none" /></svg> },
        ] as { id: VideoType; label: string; sub: string; icon: React.ReactNode }[]).map(option => (
          <button
            type="button"
            key={option.id}
            className={videoType === option.id ? 'active' : ''}
            aria-pressed={videoType === option.id}
            onClick={() => selectVideoType(option.id)}
          >
            <span className="post-format-icon">{option.icon}</span>
            <span>
              <strong>{option.label}</strong>
              <small className="mono">{option.sub}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="post-workspace">
        <section className="card post-composer-card">
          <div className="post-section-heading">
            <div>
              <div className="micro">Content</div>
              <h2 className="h2">Build your post</h2>
            </div>
            <span className="mono post-helper">Write once, tailor where needed</span>
          </div>

          <div className="post-composer-grid">
            <div className="post-media-column">
              <div className="post-field-heading">
                <label>Media</label>
                <span className="mono">MP4 · MOV · WEBM</span>
              </div>
              <div
                className={'post-drop-zone' + (dragging ? ' dragging' : '') + (file ? ' has-file' : '') + (videoType === 'long' ? ' landscape' : '')}
                onDragOver={event => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => { if (!file) fileRef.current?.click() }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/*"
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <video src={previewUrl} controls preload="metadata" aria-label={'Preview of ' + file.name} />
                    <div className="post-media-meta">
                      <div>
                        <strong>{file.name}</strong>
                        <span className="mono">{(file.size / 1024 / 1024).toFixed(1)} MB · ready</span>
                      </div>
                      <button type="button" className="btn tiny" onClick={() => fileRef.current?.click()}>Change</button>
                    </div>
                  </>
                ) : (
                  <div className="post-upload-empty">
                    <span className="post-upload-icon"><IconUpload size={21} /></span>
                    <strong>Drop a video here</strong>
                    <span>or click to browse</span>
                    <small className="mono">Up to 256 MB</small>
                  </div>
                )}
              </div>
            </div>

            <div className="post-copy-column">
              <div>
                <div className="post-field-heading">
                  <label htmlFor="post-caption">Caption</label>
                  <span className={'mono' + (caption.length > 2200 ? ' over-limit' : '')}>{caption.length} / 2200</span>
                </div>
                <textarea
                  id="post-caption"
                  className="textarea post-caption-input"
                  rows={7}
                  placeholder="Write once, post everywhere..."
                  value={caption}
                  onChange={event => setCaption(event.target.value)}
                />
              </div>

              <div>
                <div className="post-field-heading">
                  <label htmlFor="post-youtube-title"><LogoYouTube size={13} /> YouTube title</label>
                  <span className="mono">{ytCaption.length} / 60</span>
                </div>
                <input
                  id="post-youtube-title"
                  className="input"
                  maxLength={60}
                  placeholder="Add a YouTube title"
                  value={ytCaption}
                  onChange={event => setYtCaption(event.target.value)}
                />
              </div>

              {hashtags.length > 0 && (
                <div className="post-tag-list" aria-label="Selected hashtags">
                  {hashtags.map(tag => (
                    <button type="button" key={tag} onClick={() => setHashtags(current => current.filter(item => item !== tag))} className="mono" title="Remove hashtag">
                      {tag} <IconX size={10} />
                    </button>
                  ))}
                </div>
              )}

              <div className="post-ai-tools">
                <div className="post-ai-label"><IconSparkles size={13} /> AI assist</div>
                <div className="post-ai-actions">
                  <button type="button" className="btn tiny" onClick={suggestCaptions} disabled={suggestingCaptions}>
                    {suggestingCaptions ? 'Writing...' : 'Captions'}
                  </button>
                  <button type="button" className="btn tiny" onClick={suggestHashtags} disabled={suggestingHashtags}>
                    {suggestingHashtags ? 'Finding...' : 'Hashtags'}
                  </button>
                  <button type="button" className="btn tiny" onClick={suggestYtTitle} disabled={suggestingYtTitle}>
                    {suggestingYtTitle ? 'Writing...' : 'YouTube title'}
                  </button>
                </div>
              </div>

              {suggestedCaptions.length > 0 && (
                <div className="post-suggestions">
                  <div className="micro">Suggested captions · click to use</div>
                  {suggestedCaptions.map((suggestion, index) => (
                    <button type="button" key={index} onClick={() => { setCaption(suggestion); setSuggestedCaptions([]) }}>{suggestion}</button>
                  ))}
                </div>
              )}

              {suggestedHashtags.length > 0 && (
                <div className="post-suggestions">
                  <div className="post-suggestion-heading">
                    <span className="micro">Suggested hashtags</span>
                    <button type="button" onClick={() => setSuggestedHashtags([])}>Dismiss</button>
                  </div>
                  <div className="post-suggested-tags">
                    {suggestedHashtags.map(tag => (
                      <button type="button" key={tag} className="mono" onClick={() => { addTag(tag); setSuggestedHashtags(current => current.filter(item => item !== tag)) }}>{tag}</button>
                    ))}
                  </div>
                </div>
              )}

              {suggestedYtTitles.length > 0 && (
                <div className="post-suggestions">
                  <div className="post-suggestion-heading">
                    <span className="micro">Suggested YouTube titles</span>
                    <button type="button" onClick={() => setSuggestedYtTitles([])}>Dismiss</button>
                  </div>
                  {suggestedYtTitles.map((title, index) => (
                    <button type="button" key={index} onClick={() => { setYtCaption(title.slice(0, 60)); setSuggestedYtTitles([]) }}>{title}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="post-composer-footer">
            <span className="mono">{file ? 'Video selected' : 'Add a video to publish'}</span>
            <button type="button" className="btn ghost" disabled={!hasComposerContent || isBusy} onClick={clearComposer}>Clear post</button>
          </div>
        </section>

        <aside className="post-rail">
          <section className="card post-rail-card">
            <div className="post-rail-heading">
              <div>
                <div className="micro">Destinations</div>
                <h2 className="h3">Choose where to publish</h2>
              </div>
              <span className="pill">{enabledCount} selected</span>
            </div>

            <div className="post-platform-list">
              <PlatformToggle platform="instagram" enabled={enabled.instagram} locked={videoType === 'long'} onToggle={() => togglePlatform('instagram')} detail="Instagram Reels">
                <span className="post-fixed-setting">Public</span>
              </PlatformToggle>
              <PlatformToggle platform="tiktok" enabled={enabled.tiktok} locked={videoType === 'long'} onToggle={() => togglePlatform('tiktok')} detail="TikTok video">
                <select className="post-compact-select" aria-label="TikTok privacy" value={ttPrivacy} onChange={event => setTtPrivacy(event.target.value)} disabled={!enabled.tiktok || videoType === 'long'}>
                  <option value="SELF_ONLY">Only me</option>
                  <option value="FOLLOWER_OF_CREATOR">Followers</option>
                  <option value="PUBLIC_TO_EVERYONE">Public</option>
                </select>
              </PlatformToggle>
              <PlatformToggle platform="youtube" enabled={enabled.youtube} locked={false} onToggle={() => togglePlatform('youtube')} detail={videoType === 'long' ? 'YouTube video' : 'YouTube Shorts'}>
                <select className="post-compact-select" aria-label="YouTube privacy" value={privacy} onChange={event => setPrivacy(event.target.value)} disabled={!enabled.youtube}>
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </PlatformToggle>
            </div>

            {ttPrivacy !== 'SELF_ONLY' && enabled.tiktok && videoType === 'short' && (
              <p className="post-platform-note">TikTok Public and Followers require an audited TikTok app. Only me works before audit.</p>
            )}
            {videoType === 'long' && (
              <p className="post-platform-note">Long-form publishes to YouTube only.</p>
            )}
          </section>

          <section className="card post-rail-card">
            <div className="micro">Publish</div>
            <div className="post-publish-modes">
              <button type="button" className={!scheduleOpen ? 'active' : ''} aria-pressed={!scheduleOpen} onClick={() => { setScheduleOpen(false); setScheduledMsg('') }}>
                <span className="post-radio" />
                <span><strong>Post now</strong><small>Publish immediately</small></span>
              </button>
              <button type="button" className={scheduleOpen ? 'active' : ''} aria-pressed={scheduleOpen} onClick={openSchedule}>
                <span className="post-radio" />
                <span><strong>Schedule</strong><small>Choose date and time</small></span>
              </button>
            </div>

            {scheduleOpen && (
              <div className="post-schedule-fields">
                <label>
                  <span className="micro">Date</span>
                  <input type="date" className="input" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} />
                </label>
                <label>
                  <span className="micro">Time</span>
                  <input type="time" className="input" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} />
                </label>
              </div>
            )}

            {scheduledMsg && <div className={'mono post-schedule-message' + (scheduling ? ' working' : '')}>{scheduledMsg}</div>}

            <button
              type="button"
              className="btn primary big post-publish-button"
              disabled={!file || isBusy || enabledCount === 0 || (scheduleOpen && (!scheduleDate || !scheduleTime))}
              onClick={scheduleOpen ? handleSchedule : handlePostAll}
            >
              {running ? (
                <><span className="post-spinner" /> Posting {successCount}/{enabledCount}</>
              ) : scheduling ? (
                <><span className="post-spinner" /> Scheduling</>
              ) : (
                <>{scheduleOpen ? 'Schedule to' : 'Post to'} {enabledCount} platform{enabledCount !== 1 ? 's' : ''} <IconArrowRight size={15} /></>
              )}
            </button>
          </section>

          <section className="card post-rail-card post-status-card">
            <div className="post-rail-heading">
              <div className="micro">Status</div>
              {running && <span className="pill warn"><span className="dot" /> working</span>}
            </div>
            <StatusDot platform="instagram" state={statuses.instagram.state} message={statuses.instagram.message} />
            <StatusDot platform="tiktok" state={statuses.tiktok.state} message={statuses.tiktok.message} />
            <StatusDot platform="youtube" state={statuses.youtube.state} message={statuses.youtube.message} />
          </section>
        </aside>
      </div>
    </div>
  )
}
