'use client'

import { PostStatus } from '@/lib/types'

const dotStyle: Record<PostStatus, React.CSSProperties> = {
  idle:      { background: 'var(--text-mute)' },
  uploading: { background: 'var(--warn)', boxShadow: '0 0 8px var(--warn)', animation: 'pulse 1.5s ease-in-out infinite' },
  success:   { background: 'var(--ok)',   boxShadow: '0 0 8px var(--ok)' },
  failed:    { background: 'var(--bad)',  boxShadow: '0 0 8px var(--bad)' },
  skipped:   { background: 'var(--text-mute)' },
}

const textStyle: Record<PostStatus, string> = {
  idle:      'var(--text-mute)',
  uploading: 'var(--warn)',
  success:   'var(--ok)',
  failed:    'var(--bad)',
  skipped:   'var(--text-mute)',
}

const labels: Record<PostStatus, string> = {
  idle:      'waiting',
  uploading: 'uploading...',
  success:   'posted',
  failed:    'failed',
  skipped:   'skipped',
}

interface Props {
  platform: string
  state: PostStatus
  message?: string
}

export default function StatusDot({ platform, state, message }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0' }}>
      <span className="mono" style={{ color: 'var(--text-mute)', minWidth: 80, fontSize: 11, paddingTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
        {platform}
      </span>
      <span style={{
        width: 7, height: 7,
        borderRadius: '50%',
        flexShrink: 0,
        marginTop: 4,
        transition: 'all 300ms ease',
        ...dotStyle[state],
      }} />
      <span style={{ fontSize: 13, color: textStyle[state], fontWeight: 500, wordBreak: 'break-word' }}>
        {message || labels[state]}
      </span>
    </div>
  )
}
