'use client'

import { useRef, useState } from 'react'
import { CAL_FIELDS, Card, ymd } from '@/lib/board/model'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Month calendar — film/post chips per day from film_date/post_date
 * frontmatter, drag a chip to another day to reschedule, click to open.
 */
export default function CalendarView({ files, onSelect, onReschedule }: {
  files: Card[]
  onSelect: (f: Card) => void
  onReschedule: (path: string, field: string, value: string) => void
}) {
  const [cursor, setCursor] = useState(() => new Date())
  const [overDay, setOverDay] = useState<string | null>(null)
  const dragging = useRef<{ path: string; field: string } | null>(null)

  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const first = new Date(y, m, 1)
  const start = new Date(y, m, 1 - first.getDay())
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7
  const todayStr = ymd(new Date())

  const byDate: Record<string, { f: Card; field: string; label: string; color: string; time: string | null }[]> = {}
  for (const f of files) {
    for (const cf of CAL_FIELDS) {
      const dv = f.data?.[cf.field]
      if (!dv) continue
      ;(byDate[dv] = byDate[dv] || []).push({
        f, field: cf.field, label: cf.label, color: cf.color,
        time: cf.timeField ? f.data[cf.timeField] ?? null : null,
      })
    }
  }

  const nav = (dir: number) => {
    if (dir === 0) setCursor(new Date())
    else setCursor(new Date(y, m + dir, 1))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn tiny" onClick={() => nav(-1)}>‹</button>
          <button className="btn tiny" onClick={() => nav(0)}>Today</button>
          <button className="btn tiny" onClick={() => nav(1)}>›</button>
        </div>
        <span className="h3">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          {CAL_FIELDS.map(cf => (
            <span key={cf.field} className="mono dim" style={{ fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: cf.color, boxShadow: `0 0 6px ${cf.color}` }} />
              {cf.label}
            </span>
          ))}
        </span>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {WEEKDAYS.map(d => (
          <div key={d} className="micro" style={{ textAlign: 'center', color: 'var(--text-mute)' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="scroll" style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gridAutoRows: 'minmax(96px, 1fr)', gap: 6,
        flex: 1, minHeight: 0, overflowY: 'auto',
      }}>
        {Array.from({ length: cells }, (_, i) => {
          const d = new Date(start)
          d.setDate(start.getDate() + i)
          const ds = ymd(d)
          const other = d.getMonth() !== m
          const isToday = ds === todayStr
          const items = byDate[ds] || []
          return (
            <div
              key={ds}
              onDragOver={e => { e.preventDefault(); setOverDay(ds) }}
              onDragLeave={() => setOverDay(o => (o === ds ? null : o))}
              onDrop={e => {
                e.preventDefault(); setOverDay(null)
                const drag = dragging.current
                if (drag) onReschedule(drag.path, drag.field, ds)
              }}
              style={{
                background: other ? 'transparent' : 'var(--surface)',
                border: `1px solid ${overDay === ds ? 'var(--accent)' : isToday ? 'var(--border-strong)' : 'var(--hairline)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: 6,
                display: 'flex', flexDirection: 'column', gap: 4,
                opacity: other ? 0.45 : 1,
                transition: 'border-color 120ms ease',
              }}
            >
              <span className="mono" style={{
                fontSize: 10.5, alignSelf: 'flex-end',
                width: 20, height: 20, display: 'grid', placeItems: 'center', borderRadius: 999,
                color: isToday ? 'oklch(0.17 0.013 255)' : 'var(--text-mute)',
                background: isToday ? 'var(--accent)' : 'transparent',
                fontWeight: isToday ? 600 : 400,
              }}>
                {d.getDate()}
              </span>
              {items.map((it, k) => (
                <div
                  key={`${it.f.path}-${it.field}-${k}`}
                  draggable
                  onDragStart={() => { dragging.current = { path: it.f.path, field: it.field } }}
                  onDragEnd={() => { dragging.current = null }}
                  onClick={() => onSelect(it.f)}
                  title={`${it.label}: ${it.f.title}${it.time ? ' @ ' + it.time : ''}`}
                  style={{
                    fontSize: 10.5, lineHeight: 1.35,
                    padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
                    background: 'var(--surface-2)',
                    borderLeft: `2px solid ${it.color}`,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}
                >
                  {it.time ? <span className="mono" style={{ color: 'var(--text-mute)', marginRight: 4 }}>{it.time}</span> : null}
                  {it.f.title}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
