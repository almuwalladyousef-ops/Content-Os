'use client'

import { useRef, useState } from 'react'
import { CAL_FIELDS, Card, ymd } from '@/lib/board/model'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_H = 44 // px per hour in the week/day time grid

type Mode = 'month' | 'week' | 'day'

type CalItem = {
  f: Card
  field: string
  label: string
  color: string
  date: string
  time: string | null
}

/**
 * Calendar — the old board's three modes: Month (chips per day), and
 * Week/Day (hour time-grid with an all-day strip). Chips come from
 * film_date/post_date frontmatter; drag one to another day to reschedule.
 */
export default function CalendarView({ files, onSelect, onReschedule }: {
  files: Card[]
  onSelect: (f: Card) => void
  onReschedule: (path: string, field: string, value: string) => void
}) {
  const [cursor, setCursor] = useState(() => new Date())
  const [mode, setMode] = useState<Mode>('month')
  const [overDay, setOverDay] = useState<string | null>(null)
  const dragging = useRef<{ path: string; field: string } | null>(null)

  const items: CalItem[] = []
  for (const f of files) {
    for (const cf of CAL_FIELDS) {
      const dv = f.data?.[cf.field]
      if (!dv) continue
      items.push({
        f, field: cf.field, label: cf.label, color: cf.color, date: dv,
        time: cf.timeField ? f.data[cf.timeField] ?? null : null,
      })
    }
  }
  const byDate: Record<string, CalItem[]> = {}
  for (const it of items) (byDate[it.date] = byDate[it.date] || []).push(it)

  const nav = (dir: number) => {
    if (dir === 0) { setCursor(new Date()); return }
    if (mode === 'day') setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + dir))
    else if (mode === 'week') setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + dir * 7))
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
  }

  const startOfWeek = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    x.setDate(x.getDate() - x.getDay())
    return x
  }

  const days: Date[] =
    mode === 'week'
      ? Array.from({ length: 7 }, (_, i) => {
          const s = startOfWeek(cursor)
          return new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)
        })
      : mode === 'day'
        ? [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())]
        : []

  const title =
    mode === 'month'
      ? cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : mode === 'week'
        ? `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${days[6].getFullYear()}`
        : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const openDay = (ds: string) => {
    setCursor(new Date(ds + 'T00:00:00'))
    setMode('day')
  }

  const dropProps = (ds: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOverDay(ds) },
    onDragLeave: () => setOverDay(o => (o === ds ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOverDay(null)
      const drag = dragging.current
      if (drag) onReschedule(drag.path, drag.field, ds)
    },
  })

  const chip = (it: CalItem, k: React.Key, opts?: { block?: boolean }) => (
    <div
      key={k}
      draggable
      onDragStart={() => { dragging.current = { path: it.f.path, field: it.field } }}
      onDragEnd={() => { dragging.current = null }}
      onClick={e => { e.stopPropagation(); onSelect(it.f) }}
      title={`${it.label}: ${it.f.title}${it.time ? ' @ ' + it.time : ''}`}
      style={{
        fontSize: 10.5, lineHeight: 1.35,
        padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
        background: 'var(--surface-2)',
        overflow: 'hidden', textOverflow: 'ellipsis',
        ...(opts?.block
          ? { position: 'absolute' as const, left: 3, right: 3, border: '1px solid var(--hairline)' }
          : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }),
        borderLeft: `2px solid ${it.color}`,
      }}
    >
      {it.time ? <span className="mono" style={{ color: 'var(--text-mute)', marginRight: 4 }}>{it.time}</span> : null}
      {it.f.title}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn tiny" onClick={() => nav(-1)}>‹</button>
          <button className="btn tiny" onClick={() => nav(0)}>Today</button>
          <button className="btn tiny" onClick={() => nav(1)}>›</button>
        </div>
        <span className="h3">{title}</span>
        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--hairline)' }}>
          {(['month', 'week', 'day'] as Mode[]).map(mm => (
            <button
              key={mm}
              onClick={() => setMode(mm)}
              style={{
                padding: '4px 11px', borderRadius: 6, fontSize: 11.5, textTransform: 'capitalize',
                color: mode === mm ? 'var(--text)' : 'var(--text-dim)',
                background: mode === mm ? 'var(--surface-2)' : 'transparent',
                border: `1px solid ${mode === mm ? 'var(--border)' : 'transparent'}`,
              }}
            >
              {mm}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          {CAL_FIELDS.map(cf => (
            <span key={cf.field} className="mono dim" style={{ fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: cf.color, boxShadow: `0 0 6px ${cf.color}` }} />
              {cf.label}
            </span>
          ))}
        </span>
      </div>

      {mode === 'month' ? (
        <MonthGrid
          cursor={cursor} byDate={byDate} overDay={overDay}
          dropProps={dropProps} chip={chip} onOpenDay={openDay}
        />
      ) : (
        <TimeGrid days={days} byDate={byDate} overDay={overDay} dropProps={dropProps} chip={chip} onOpenDay={openDay} />
      )}
    </div>
  )
}

// ── Month ────────────────────────────────────────────────────────────────────

function MonthGrid({ cursor, byDate, overDay, dropProps, chip, onOpenDay }: {
  cursor: Date
  byDate: Record<string, CalItem[]>
  overDay: string | null
  dropProps: (ds: string) => object
  chip: (it: CalItem, k: React.Key, opts?: { block?: boolean }) => React.ReactNode
  onOpenDay: (ds: string) => void
}) {
  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const first = new Date(y, m, 1)
  const start = new Date(y, m, 1 - first.getDay())
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7
  const todayStr = ymd(new Date())

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {WEEKDAYS.map(d => (
          <div key={d} className="micro" style={{ textAlign: 'center', color: 'var(--text-mute)' }}>{d}</div>
        ))}
      </div>
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
          const dayItems = byDate[ds] || []
          return (
            <div
              key={ds}
              {...dropProps(ds)}
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
              <button
                onClick={() => onOpenDay(ds)}
                title="Open day"
                className="mono"
                style={{
                  fontSize: 10.5, alignSelf: 'flex-end',
                  width: 20, height: 20, display: 'grid', placeItems: 'center', borderRadius: 999,
                  color: isToday ? 'oklch(0.17 0.013 255)' : 'var(--text-mute)',
                  background: isToday ? 'var(--accent)' : 'transparent',
                  fontWeight: isToday ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {d.getDate()}
              </button>
              {dayItems.map((it, k) => chip(it, `${it.f.path}-${it.field}-${k}`))}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Week / Day time grid ─────────────────────────────────────────────────────

function TimeGrid({ days, byDate, overDay, dropProps, chip, onOpenDay }: {
  days: Date[]
  byDate: Record<string, CalItem[]>
  overDay: string | null
  dropProps: (ds: string) => object
  chip: (it: CalItem, k: React.Key, opts?: { block?: boolean }) => React.ReactNode
  onOpenDay: (ds: string) => void
}) {
  const todayStr = ymd(new Date())
  const timeToMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const labelHour = (h: number) => {
    const ap = h < 12 ? 'AM' : 'PM'
    let hr = h % 12
    if (hr === 0) hr = 12
    return `${hr} ${ap}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, border: '1px solid var(--hairline)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Day headers + all-day strip */}
      <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, borderBottom: '1px solid var(--hairline)' }}>
        <div />
        {days.map(d => {
          const ds = ymd(d)
          const isToday = ds === todayStr
          const allDay = (byDate[ds] || []).filter(it => !it.time)
          return (
            <div key={ds} {...dropProps(ds)} style={{
              padding: '8px 6px', borderLeft: '1px solid var(--hairline)',
              display: 'flex', flexDirection: 'column', gap: 4,
              background: overDay === ds ? 'var(--accent-dim)' : 'transparent',
            }}>
              <button onClick={() => onOpenDay(ds)} style={{ display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer' }}>
                <span className="micro" style={{ color: 'var(--text-mute)' }}>{WEEKDAYS[d.getDay()]}</span>
                <span className="mono" style={{
                  fontSize: 13, fontWeight: isToday ? 600 : 400,
                  color: isToday ? 'var(--accent)' : 'var(--text)',
                }}>
                  {d.getDate()}
                </span>
              </button>
              {allDay.map((it, k) => chip(it, `${it.f.path}-${it.field}-ad-${k}`))}
            </div>
          )
        })}
      </div>

      {/* Hour grid */}
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, height: 24 * HOUR_H }}>
          {/* Hour labels */}
          <div style={{ position: 'relative' }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="mono" style={{
                position: 'absolute', top: h * HOUR_H - 6, right: 8,
                fontSize: 9.5, color: 'var(--text-mute)',
              }}>
                {h > 0 ? labelHour(h) : ''}
              </div>
            ))}
          </div>
          {days.map(d => {
            const ds = ymd(d)
            const timed = (byDate[ds] || []).filter(it => it.time)
            return (
              <div key={ds} {...dropProps(ds)} style={{
                position: 'relative', borderLeft: '1px solid var(--hairline)',
                background: overDay === ds ? 'var(--accent-dim)' : 'transparent',
                backgroundImage: `repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px ${HOUR_H}px)`,
              }}>
                {timed.map((it, k) => {
                  const top = (timeToMin(it.time!) / 60) * HOUR_H
                  return (
                    <div key={`${it.f.path}-${it.field}-${k}`} style={{ position: 'absolute', top, left: 0, right: 0, height: HOUR_H - 4, padding: '2px 0' }}>
                      {chip(it, `c-${k}`, { block: true })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
