'use client'

import { useRef, useState, useEffect } from 'react'
import {
  IconUpload, IconLink, IconSparkles, IconClock, IconClipboard,
  IconArrowUp, IconExternal, IconEye, IconCheck, IconBolt,
  PlatformIcon,
} from '@/components/Icons'
import { VideoAnalysis, PlatformPost, PlatformMetricsData } from '@/lib/types'

// ── WAV encoder ───────────────────────────────────────────────────────────────
function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const samples = audioBuffer.getChannelData(0)
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hookScore(strength: string) {
  if (strength === 'strong') return 82
  if (strength === 'medium') return 58
  return 32
}
function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'K'
  return n.toLocaleString()
}
function ratioOf(part: number, whole: number) {
  if (!whole) return '0.00'
  return ((part / whole) * 100).toFixed(2)
}

// ── Animated hook meter ───────────────────────────────────────────────────────
function HookMeter({ score = 0, strength, size = 168 }: { score?: number; strength?: string; size?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const dur = 1000
    let raf: number
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(score * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])

  const color = score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--bad)'
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (v / 100) * c

  return (
    <div style={{ display: 'grid', placeItems: 'center', position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke 240ms ease', filter: `drop-shadow(0 0 12px ${color})` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="mono" style={{ fontSize: size > 100 ? 44 : 22, color: 'var(--text)', fontWeight: 500, lineHeight: 1 }}>
            {Math.round(v)}
          </div>
          <div className="micro" style={{ marginTop: 4 }}>{strength || 'score'}</div>
        </div>
      </div>
    </div>
  )
}

// ── Weight bar ────────────────────────────────────────────────────────────────
function WeightBar({ weight }: { weight: number }) {
  return (
    <div style={{ position: 'relative', height: 4, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        width: `${Math.round(weight * 100)}%`,
        background: 'var(--accent)', borderRadius: 999,
        transition: 'width 600ms cubic-bezier(0.2,0.7,0.2,1)',
        boxShadow: '0 0 8px var(--accent)',
      }} />
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--bad)'
  const dim = score >= 75 ? 'oklch(0.78 0.16 155 / 0.12)' : score >= 50 ? 'oklch(0.82 0.15 80 / 0.12)' : 'oklch(0.70 0.19 25 / 0.12)'
  const big = size === 'lg'
  return (
    <div className="mono" style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 3,
      padding: big ? '6px 12px' : '3px 8px',
      borderRadius: 6, background: dim, color,
      fontSize: big ? 16 : 12, fontWeight: 600,
      border: `1px solid ${color}`,
      letterSpacing: '0.02em',
    }}>
      {score}<span style={{ fontSize: big ? 10 : 9, opacity: 0.6 }}>/100</span>
    </div>
  )
}

// ── Stat mini ─────────────────────────────────────────────────────────────────
function Stat({ icon, dot, value, label }: { icon?: React.ReactNode; dot?: boolean; value: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
      {icon}
      {dot && <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--text-mute)' }} />}
      <span className="mono" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{value}</span>
      <span style={{ color: 'var(--text-mute)' }}>{label}</span>
    </span>
  )
}

// ── Segmented tabs ────────────────────────────────────────────────────────────
function SegTabs({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { v: string; label: string; icon?: React.ReactNode }[]
}) {
  return (
    <div style={{
      display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10,
      background: 'var(--bg-2)', border: '1px solid var(--hairline)',
    }}>
      {options.map(opt => {
        const active = value === opt.v
        return (
          <button
            key={opt.v}
            onClick={() => onChange(opt.v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 7,
              fontSize: 12.5, fontWeight: 500,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-dim)',
              boxShadow: active ? '0 1px 0 oklch(1 0 0 / 0.04) inset, 0 4px 12px oklch(0 0 0 / 0.25)' : 'none',
              border: active ? '1px solid var(--hairline)' : '1px solid transparent',
              transition: 'all 120ms ease',
            }}
          >
            {opt.icon} {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({ post, platform, selected, onClick }: {
  post: PlatformPost
  platform: Platform
  selected: boolean
  onClick: () => void
}) {
  const caption = platform === 'youtube' ? post.title : post.caption
  const date = new Date(post.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const plays = platform === 'youtube' ? (post.metrics.views ?? 0) : platform === 'tiktok' ? (post.metrics.views ?? 0) : (post.metrics.plays ?? 0)
  const likes = post.metrics.likes ?? 0
  const comments = post.metrics.comments ?? 0
  const hue = post.id.charCodeAt(0) * 5 % 360

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', gap: 14, alignItems: 'center', padding: 12,
        borderRadius: 12,
        background: selected ? 'var(--accent-dim)' : 'var(--bg-2)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
        textAlign: 'left', transition: 'all 140ms ease', cursor: 'pointer',
        outline: selected ? '2px solid var(--accent-glow)' : 'none', outlineOffset: -1,
        width: '100%',
      }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: 8, flexShrink: 0,
        background: post.thumbnail
          ? undefined
          : `linear-gradient(135deg, oklch(0.45 0.14 ${hue}), oklch(0.30 0.10 ${hue + 30}))`,
        position: 'relative', overflow: 'hidden', border: '1px solid var(--hairline)',
      }}>
        {post.thumbnail
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={post.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(115deg, transparent 0 8px, oklch(1 0 0 / 0.04) 8px 9px)' }} />
        }
        <div style={{ position: 'absolute', top: 4, left: 5, color: 'oklch(1 0 0 / 0.9)' }}>
          <PlatformIcon platform={platform} size={13} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {caption || 'No caption'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>{date}</span>
          <Stat icon={<IconEye size={11} />} value={formatCount(plays)} label={platform === 'youtube' ? 'views' : 'plays'} />
          <Stat dot value={formatCount(likes)} label="likes" />
          <Stat dot value={formatCount(comments)} label="comments" />
        </div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: 999,
        background: selected ? 'var(--accent)' : 'var(--bg)',
        border: `1px solid ${selected ? 'transparent' : 'var(--hairline)'}`,
        display: 'grid', placeItems: 'center',
        color: selected ? 'oklch(0.18 0.013 255)' : 'var(--text-mute)',
        flexShrink: 0, transition: 'all 140ms ease',
      }}>
        {selected ? <IconCheck size={12} /> : null}
      </div>
    </button>
  )
}

// ── Source summary ────────────────────────────────────────────────────────────
function SourceSummary({ post, platform, stage }: {
  post: PlatformPost
  platform: string
  stage: string
}) {
  const date = new Date(post.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const hue = post.id.charCodeAt(0) * 5 % 360
  const riskColor = stage === 'done' ? 'var(--ok)' : stage === 'idle' ? 'var(--text-mute)' : 'var(--accent)'
  return (
    <div className="card" style={{ padding: 'var(--pad-sm)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, oklch(0.45 0.14 ${hue}), oklch(0.30 0.10 ${hue + 30}))`,
        border: '1px solid var(--hairline)',
        display: 'grid', placeItems: 'center', color: 'oklch(1 0 0 / 0.92)',
      }}>
        <PlatformIcon platform={platform} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(platform === 'youtube' ? post.title : post.caption) || 'No caption'}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          {platform === 'youtube' ? 'YouTube' : platform === 'tiktok' ? 'TikTok' : 'Instagram'} · {date} · id <span style={{ color: 'var(--text-2)' }}>{post.id.slice(0, 16)}</span>
        </div>
      </div>
      <span className="pill" style={{
        background: stage === 'done' ? 'oklch(0.78 0.16 155 / 0.12)' : 'var(--surface-2)',
        borderColor: stage === 'done' ? 'oklch(0.78 0.16 155 / 0.4)' : 'var(--hairline)',
        color: stage === 'done' ? 'var(--ok)' : 'var(--text-2)',
      }}>
        <span className="dot" style={{
          background: riskColor,
          boxShadow: stage === 'done' ? '0 0 8px var(--ok)' : stage !== 'idle' ? '0 0 8px var(--accent-glow)' : 'none',
        }} />
        {stage === 'done' ? 'analysis ready' : stage === 'fetching' ? 'fetching captions' : stage === 'analyzing' ? 'running gemini' : 'live source'}
      </span>
      {post.permalink && (
        <a className="btn ghost tiny" href={post.permalink} target="_blank" rel="noopener noreferrer">
          <IconExternal size={11} /> Open post
        </a>
      )}
    </div>
  )
}

// ── Platform metrics card ─────────────────────────────────────────────────────
function PlatformMetricsCard({ metrics, platform }: { metrics: PlatformMetricsData; platform: string }) {
  const isYT = platform === 'youtube'
  const isTT = platform === 'tiktok'
  const rawPlays = (isYT || isTT) ? metrics.views : metrics.plays
  const plays = rawPlays ?? 0
  const reach = metrics.reach ?? 0
  const likes = metrics.likes ?? 0
  const comments = metrics.comments ?? 0
  const rawShares = metrics.shares
  const rawSaves = metrics.saves
  const shares = rawShares ?? 0
  const saves = rawSaves ?? 0
  // ER only computed when we have a reliable denominator from insights (plays or reach)
  const erDenominator = plays > 0 ? plays : reach > 0 ? reach : 0
  const erTotal = likes + comments + shares + saves
  const engagementRate = erDenominator > 0 ? (erTotal / erDenominator) * 100 : null
  const erLabel = plays > 0 ? 'ER total' : 'ER by reach'

  const tiles = [
    { k: (isYT || isTT) ? 'views' : 'plays', v: rawPlays !== undefined ? formatCount(rawPlays) : '—', sub: 'lifetime' },
    { k: 'likes', v: formatCount(likes), sub: erDenominator > 0 ? ratioOf(likes, erDenominator) + '%' : '—' },
    { k: 'comments', v: formatCount(comments), sub: erDenominator > 0 ? ratioOf(comments, erDenominator) + '%' : '—' },
    { k: 'shares', v: rawShares !== undefined ? formatCount(shares) : '—', sub: erDenominator > 0 ? ratioOf(shares, erDenominator) + '%' : '—' },
    ...(rawSaves ? [{ k: 'saves', v: formatCount(saves), sub: erDenominator > 0 ? ratioOf(saves, erDenominator) + '%' : '—' }] : []),
    { k: 'engagement', v: engagementRate !== null ? engagementRate.toFixed(2) + '%' : '—', sub: engagementRate !== null ? erLabel : 'no insight data' },
  ]

  const apiLabel = isYT ? 'YouTube Data API v3' : isTT ? 'TikTok Content Posting API' : 'Instagram Graph API'

  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>
            live · pulled from {apiLabel}
          </div>
          <h2 className="h2">Platform metrics</h2>
        </div>
        <span className="pill ok"><span className="dot" /> synced just now</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`,
        gap: 10,
      }}>
        {tiles.map(t => (
          <div key={t.k} style={{
            padding: 14, background: 'var(--bg-2)', border: '1px solid var(--hairline)',
            borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
          }}>
            <div className="micro" style={{ marginBottom: 0 }}>{t.k}</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {t.v}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Analysis cards ────────────────────────────────────────────────────────────
function HookCard({ hook }: { hook: VideoAnalysis['hook'] }) {
  const score = hookScore(hook.strength)
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div className="micro" style={{ marginBottom: 16 }}>The Hook</div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <HookMeter score={score} strength={hook.strength.toUpperCase()} size={140} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div className="micro" style={{ marginBottom: 4 }}>category</div>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{hook.category}</div>
          </div>
          <div>
            <div className="micro" style={{ marginBottom: 4 }}>template</div>
            <div className="mono" style={{
              fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, fontStyle: 'italic',
              padding: '8px 10px', borderLeft: '2px solid var(--accent)',
              background: 'var(--bg-2)', borderRadius: '0 6px 6px 0',
            }}>
              &ldquo;{hook.template}&rdquo;
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
        <div className="micro" style={{ marginBottom: 6 }}>Assessment</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{hook.assessment}</div>
      </div>
    </div>
  )
}

function FormatCard({ analysis }: { analysis: VideoAnalysis }) {
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div className="micro" style={{ marginBottom: 16 }}>Format</div>
      <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.35, marginBottom: 14, color: 'var(--text)' }}>
        {analysis.format}
      </div>
      <div className="micro" style={{ marginBottom: 8 }}>Main topic</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>{analysis.main_topic}</div>
      <div className="micro" style={{ marginBottom: 8 }}>Subtopics</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {analysis.subtopics.map((s, i) => (
          <span key={i} className="mono" style={{
            fontSize: 10.5, padding: '3px 8px', borderRadius: 5,
            background: 'var(--bg-2)', border: '1px solid var(--hairline)', color: 'var(--text-2)',
          }}>{s}</span>
        ))}
      </div>
    </div>
  )
}

function VerdictCard({ analysis }: { analysis: VideoAnalysis }) {
  const score = hookScore(analysis.hook.strength)
  return (
    <div className="card" style={{ padding: 'var(--pad)', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(400px 200px at 100% 0%, var(--accent-dim), transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative' }}>
        <div className="micro" style={{ marginBottom: 16 }}>Verdict</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <ScoreBadge score={score} size="lg" />
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>top 25% in niche</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{analysis.overall_assessment}</div>
      </div>
    </div>
  )
}

function ViralityCard({ factors }: { analysis?: VideoAnalysis; factors: string[] }) {
  const weights = [0.85, 0.72, 0.61, 0.52, 0.44, 0.38]
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>What&apos;s driving shares</div>
          <h2 className="h2">Virality factors</h2>
        </div>
        <IconBolt size={20} style={{ color: 'var(--accent)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {factors.map((text, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, flex: 1 }}>{text}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                {Math.round((weights[i] ?? 0.3) * 100)}
              </span>
            </div>
            <WeightBar weight={weights[i] ?? 0.3} />
          </div>
        ))}
      </div>
    </div>
  )
}

function NarrativeCard({ structure }: { structure: VideoAnalysis['narrative_structure'] }) {
  const steps = [
    { k: 'Opening', t: '0:00 – intro', text: structure.opening },
    { k: 'Middle', t: 'body', text: structure.middle },
    { k: 'Closing', t: 'outro', text: structure.closing },
  ]
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div className="micro" style={{ marginBottom: 6 }}>Story arc</div>
      <h2 className="h2" style={{ marginBottom: 16 }}>Narrative structure</h2>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: 'var(--hairline)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <div style={{
                width: 15, height: 15, borderRadius: 999, marginTop: 2,
                background: 'var(--surface)', border: '2px solid var(--accent)',
                position: 'relative', zIndex: 1, flexShrink: 0,
                boxShadow: '0 0 8px var(--accent-glow)',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.k}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-mute)' }}>{s.t}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
        <div className="micro" style={{ marginBottom: 6 }}>Pacing</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{structure.pacing}</div>
      </div>
    </div>
  )
}

function ImprovementsCard({ items }: { items: string[] }) {
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>If you only do these</div>
          <h2 className="h2">Suggested improvements</h2>
        </div>
        <span className="pill accent"><span className="dot" /> {items.length} actions</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {items.map((s, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: 14, borderRadius: 10,
            background: 'var(--bg-2)', border: '1px solid var(--hairline)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              width: 24, height: 24, flexShrink: 0, borderRadius: 7,
              background: 'var(--accent-dim)', color: 'var(--accent-2)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11,
              border: '1px solid oklch(0.72 0.16 255 / 0.3)',
            }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TranscriptCard({ transcript, platform }: { transcript: string; platform: string }) {
  const [open, setOpen] = useState(true)
  const isYT = platform === 'youtube'
  const isUpload = platform === 'upload'
  const sourceLabel = isUpload ? 'Groq Whisper transcription' : isYT ? 'YouTube caption track' : 'Instagram caption text'
  const titleLabel = isUpload || isYT ? 'Transcript' : 'Caption'
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
      >
        <div>
          <div className="micro" style={{ marginBottom: 4, textAlign: 'left' }}>
            source · {sourceLabel}
          </div>
          <div className="h2" style={{ textAlign: 'left' }}>{titleLabel}</div>
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{open ? 'hide' : 'show'} ↓</span>
      </button>
      {open && (
        <div className="mono" style={{
          marginTop: 14, padding: 14, borderRadius: 10,
          background: 'var(--bg-2)', border: '1px solid var(--hairline)',
          fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)', whiteSpace: 'pre-wrap',
        }}>
          {transcript}
        </div>
      )}
    </div>
  )
}

// ── Upload pane ───────────────────────────────────────────────────────────────
function UploadPane({ file, onBrowse, onRun, running, stage, isLarge }: {
  file: File | null
  onBrowse: () => void
  onRun: () => void
  running: boolean
  stage: string
  isLarge: boolean
}) {
  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        onClick={onBrowse}
        style={{
          padding: 28, borderRadius: 12, border: '1.5px dashed var(--hairline)',
          background: 'var(--bg-2)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10, cursor: 'pointer',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--text-mute)' }}>
          <IconUpload size={20} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)' }}>
          {file ? file.name : 'Drop a video or audio file'}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB${isLarge ? ' · large file — audio extracted' : ''}`
            : 'Up to 500 MB · mp4 · mov · wav'
          }
        </div>
        {!file && <button className="btn" onClick={e => { e.stopPropagation(); onBrowse() }}><IconUpload size={13} /> Browse video</button>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn primary" disabled={!file || running} onClick={onRun} style={{ height: 40, padding: '0 18px' }}>
          {running ? (
            <>{stage === 'fetching' ? 'Transcribing…' : 'Analyzing…'}</>
          ) : (
            <><IconSparkles size={14} /> Analyze</>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Mode = 'upload' | 'platform'
type Platform = 'instagram' | 'youtube' | 'tiktok'

export default function AnalysisPage() {
  const [mode, setMode] = useState<Mode>('platform')
  const [transcript, setTranscript] = useState('')
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  const [platform, setPlatform] = useState<Platform>('instagram')
  const [posts, setPosts] = useState<PlatformPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [postsError, setPostsError] = useState('')
  const [selectedPost, setSelectedPost] = useState<PlatformPost | null>(null)
  const [metrics, setMetrics] = useState<PlatformMetricsData | null>(null)

  const isLarge = file ? file.size > 25 * 1024 * 1024 : false
  const stage = analysis ? 'done' : running ? (status.includes('fetch') || status.includes('Transcrib') ? 'fetching' : 'analyzing') : 'idle'

  async function fetchPosts(p: Platform) {
    setLoadingPosts(true)
    setPostsError('')
    try {
      const url = p === 'instagram' ? '/api/platforms/instagram' : p === 'tiktok' ? '/api/platforms/tiktok/videos' : '/api/platforms/youtube/videos'
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) { setPostsError(data.error); return }
      setPosts(data.posts ?? [])
    } catch (e: unknown) {
      setPostsError(String(e))
    } finally {
      setLoadingPosts(false)
    }
  }

  async function handleUploadRun() {
    if (!file) return
    setRunning(true); setError(''); setTranscript(''); setAnalysis(null); setMetrics(null); setSaved(false)
    try {
      setStatus('extracting audio...')
      let audioFile: File | Blob = file
      if (file.size > 25 * 1024 * 1024) {
        const arrayBuf = await file.arrayBuffer()
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf)
        await audioCtx.close()
        const wavBlob = encodeWAV(audioBuffer)
        audioFile = new File([wavBlob], file.name.replace(/\.[^.]+$/, '.wav'), { type: 'audio/wav' })
      }
      setStatus('transcribing with Groq Whisper...')
      const fd = new FormData()
      fd.append('file', audioFile, (audioFile as File).name ?? 'audio.wav')
      const tRes = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const tData = await tRes.json()
      if (tData.error) throw new Error(tData.error)
      setTranscript(tData.transcript)
      setStatus('analyzing with Gemini...')
      const aRes = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: tData.transcript }) })
      const aData = await aRes.json()
      if (aData.error) throw new Error(aData.error)
      setAnalysis(aData.analysis)
      setStatus('')
    } catch (e: unknown) {
      setError(String(e)); setStatus('')
    } finally {
      setRunning(false)
    }
  }

  async function handlePlatformRun() {
    if (!selectedPost) return
    setRunning(true); setError(''); setTranscript(''); setAnalysis(null); setMetrics(selectedPost.metrics); setSaved(false)
    try {
      let text = ''
      if (platform === 'youtube') {
        setStatus('fetching YouTube captions...')
        const tRes = await fetch(`/api/platforms/youtube/transcript?videoId=${selectedPost.id}`)
        const tData = await tRes.json()
        if (tData.error) throw new Error(tData.error)
        text = tData.transcript
        setTranscript(text)
      } else {
        text = selectedPost.caption ?? ''
        if (!text) throw new Error(`This ${platform === 'tiktok' ? 'video has no description' : 'post has no caption'} text to analyze.`)
        setTranscript(text)
      }
      setStatus('analyzing with Gemini...')
      const aRes = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text }) })
      const aData = await aRes.json()
      if (aData.error) throw new Error(aData.error)
      setAnalysis(aData.analysis)
      setStatus('')
    } catch (e: unknown) {
      setError(String(e)); setStatus('')
    } finally {
      setRunning(false)
    }
  }

  async function handleSave() {
    if (!analysis || !transcript) return
    setSaved(false)
    try {
      const name = mode === 'upload'
        ? (file?.name.replace(/\.[^.]+$/, '') ?? 'video')
        : (selectedPost?.title ?? selectedPost?.caption?.slice(0, 40) ?? 'video')
      const timestamp = new Date().toISOString().slice(0, 10)
      await fetch('/api/drive/save-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript, analysis, name, timestamp }) })
      await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', entry: { id: crypto.randomUUID(), date: new Date().toISOString(), video_name: name, platforms: selectedPost ? [platform] : [], caption: selectedPost?.caption ?? '' } }) })
      setSaved(true)
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  const ANALYSIS_PLATFORMS = [
    { id: 'instagram' as Platform, name: 'Instagram', sub: 'caption-based' },
    { id: 'youtube' as Platform, name: 'YouTube', sub: 'caption track' },
    { id: 'tiktok' as Platform, name: 'TikTok', sub: 'description-based' },
  ]

  return (
    <div className="anim-up" style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>v2 analyzer</div>
          <h1 className="h1">Analyze video content</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pill"><span className="dot" style={{ background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)' }} /> 2 accounts connected</span>
          {analysis && (
            <button className="btn ghost" onClick={() => {
              const text = JSON.stringify(analysis, null, 2)
              navigator.clipboard?.writeText(text)
            }}>
              <IconClipboard size={14} /> Copy report
            </button>
          )}
          {analysis && <button className="btn" onClick={handleSave}><IconArrowUp size={14} /> {saved ? '✓ Saved' : 'Save to Drive'}</button>}
        </div>
      </div>

      {/* Picker card */}
      <div className="card" style={{ padding: 'var(--pad)' }}>
        <SegTabs
          value={mode}
          onChange={v => {
            setMode(v as Mode)
            setAnalysis(null)
            setTranscript('')
            setError('')
            setMetrics(null)
            setSaved(false)
            if (v === 'platform') { setSelectedPost(null); setPosts([]); setPostsError(''); fetchPosts(platform) }
          }}
          options={[
            { v: 'platform', label: 'From platform', icon: <IconLink size={13} /> },
            { v: 'upload', label: 'Upload file', icon: <IconUpload size={13} /> },
          ]}
        />

        {mode === 'platform' ? (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Platform sub-tabs */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {ANALYSIS_PLATFORMS.map(p => {
                const active = platform === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPlatform(p.id)
                      setSelectedPost(null)
                      setPosts([])
                      setPostsError('')
                      setAnalysis(null)
                      setTranscript('')
                      setMetrics(null)
                      setError('')
                      fetchPosts(p.id)
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
                      background: active ? 'var(--accent-dim)' : 'var(--bg-2)',
                      color: active ? 'var(--text)' : 'var(--text-2)',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <PlatformIcon platform={p.id} size={14} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>· {p.sub}</span>
                  </button>
                )
              })}
              <div style={{ flex: 1 }} />
              <button className="btn ghost tiny" onClick={() => fetchPosts(platform)}><IconClock size={11} /> Refresh</button>
            </div>

            {/* Post list */}
            {loadingPosts ? (
              <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-mute)' }}>Loading posts…</div>
            ) : postsError ? (
              <div style={{ background: 'oklch(0.70 0.19 25 / 0.1)', border: '1px solid oklch(0.70 0.19 25 / 0.3)', color: 'var(--bad)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                {postsError}
              </div>
            ) : posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-mute)' }}>No recent posts found.</div>
            ) : (
              <div className="scroll" style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 4, margin: -4 }}>
                {posts.map(p => (
                  <PostCard
                    key={p.id}
                    post={p}
                    platform={platform}
                    selected={p.id === selectedPost?.id}
                    onClick={() => { setSelectedPost(p); setAnalysis(null); setTranscript(''); setMetrics(null); setError(''); setSaved(false) }}
                  />
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8, borderTop: '1px solid var(--hairline)' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                {platform === 'instagram'
                  ? 'Caption text + post metrics pulled live from Instagram Graph API.'
                  : platform === 'tiktok'
                  ? 'Video description + metrics pulled live from TikTok Content Posting API.'
                  : 'Caption track pulled live from YouTube Data API v3.'}
              </div>
              <button
                className="btn primary"
                onClick={handlePlatformRun}
                disabled={!selectedPost || running}
                style={{ height: 40, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {running ? (
                  <>
                    <span style={{ width: 12, height: 12, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 700ms linear infinite', display: 'inline-block' }} />
                    {stage === 'fetching' ? 'Fetching captions…' : 'Analyzing…'}
                  </>
                ) : (
                  <><IconSparkles size={14} /> Analyze</>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              style={{ display: 'none' }}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setTranscript(''); setAnalysis(null); setError('') }}
            />
            <UploadPane
              file={file}
              onBrowse={() => fileRef.current?.click()}
              onRun={handleUploadRun}
              running={running}
              stage={stage}
              isLarge={isLarge}
            />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'oklch(0.70 0.19 25 / 0.1)', border: '1px solid oklch(0.70 0.19 25 / 0.3)', color: 'var(--bad)', padding: '12px 16px', borderRadius: 10, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Source summary */}
      {selectedPost && mode === 'platform' && (
        <SourceSummary post={selectedPost} platform={platform} stage={stage} />
      )}

      {/* Platform metrics */}
      {metrics && mode === 'platform' && selectedPost && (
        <PlatformMetricsCard metrics={metrics} platform={platform} />
      )}

      {/* Transcript — shown as soon as it's available, before analysis cards */}
      {transcript && (
        <TranscriptCard transcript={transcript} platform={mode === 'upload' ? 'upload' : platform} />
      )}

      {/* Analysis cards */}
      {analysis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 0.9fr', gap: 'var(--gap)' }}>
            <HookCard hook={analysis.hook} />
            <FormatCard analysis={analysis} />
            <VerdictCard analysis={analysis} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
            <ViralityCard factors={analysis.virality_factors} />
            <NarrativeCard structure={analysis.narrative_structure} />
          </div>
          <ImprovementsCard items={analysis.suggested_improvements} />
        </>
      )}

      {/* Empty state */}
      {!analysis && selectedPost && mode === 'platform' && (
        <div className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16, borderStyle: 'dashed', background: 'transparent' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg-2)', display: 'grid', placeItems: 'center', border: '1px solid var(--hairline)' }}>
            <IconSparkles size={20} style={{ color: 'var(--text-mute)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-2)', marginBottom: 2 }}>Ready when you are</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>
              {platform === 'youtube'
                ? 'Will fetch YouTube captions, then run Gemini analysis on the transcript.'
                : platform === 'tiktok'
                ? 'Will analyze the video description with Gemini using live TikTok metrics for context.'
                : 'Will analyze the caption text with Gemini using live IG metrics for context.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
