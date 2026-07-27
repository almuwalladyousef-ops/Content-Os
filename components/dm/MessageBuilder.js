'use client'
import { useState, useMemo } from 'react'
import { planMessages, INSTAGRAM_TEXT_LIMIT } from '@/lib/dm/messagePlan'

const PERSONALIZATION_TOKENS = ['{{first_name}}', '{{name}}', '{{username}}']

function blockSummary(block) {
  if (block.type === 'text') return block.content?.trim() || 'Empty message'
  if (block.type === 'link') return block.url || 'No URL set'
  if (block.type === 'button') return `${block.label || 'Button'} — ${block.url || 'No URL'}`
  return ''
}

export default function MessageBuilder({ messages, onChange }) {
  const [blocks, setBlocks] = useState(messages || [])
  const [expanded, setExpanded] = useState({})

  function update(newBlocks) {
    setBlocks(newBlocks)
    onChange(newBlocks)
  }

  function addBlock(type) {
    const block =
      type === 'text' ? { type: 'text', content: '' }
      : type === 'link' ? { type: 'link', url: '' }
      : { type: 'button', label: 'Get the link!', url: '' }
    const newIndex = blocks.length
    update([...blocks, block])
    setExpanded(prev => ({ ...prev, [newIndex]: true }))
  }

  function updateBlock(index, field, value) {
    const next = blocks.map((b, i) => i === index ? { ...b, [field]: value } : b)
    update(next)
  }

  function removeBlock(index) {
    update(blocks.filter((_, i) => i !== index))
    setExpanded(prev => {
      const next = {}
      Object.keys(prev).forEach(k => {
        const ki = Number(k)
        if (ki < index) next[ki] = prev[k]
        else if (ki > index) next[ki - 1] = prev[k]
      })
      return next
    })
  }

  function moveBlock(index, dir) {
    const next = [...blocks]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    update(next)
    setExpanded(prev => {
      const n = { ...prev }
      const tmp = n[index]
      n[index] = n[target]
      n[target] = tmp
      return n
    })
  }

  function insertToken(index, token) {
    const b = blocks[index]
    if (b.type !== 'text') return
    updateBlock(index, 'content', (b.content || '') + token)
  }

  function toggleExpanded(index) {
    setExpanded(prev => ({ ...prev, [index]: !prev[index] }))
  }

  const textBlockCount = blocks.filter(b => b.type === 'text').length
  const buttonCount = blocks.filter(b => b.type === 'button').length
  // Same planner the sender uses, so the preview cannot drift from reality.
  const plan = useMemo(() => planMessages(blocks), [blocks])

  return (
    <div className="message-builder">
      <div className="blocks">
        {blocks.map((block, i) => {
          const isOpen = !!expanded[i]
          const typeLabel = block.type === 'text' ? 'Message' : block.type === 'link' ? 'Link' : 'Button'
          return (
            <div key={i} className={`block block--${block.type} ${isOpen ? 'block--open' : 'block--collapsed'}`}>
              <div className="block-controls">
                <button
                  className="block-toggle"
                  onClick={() => toggleExpanded(i)}
                  title={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                <span className="block-type-label">{typeLabel}</span>
                {!isOpen && (
                  <span className="block-summary">{blockSummary(block)}</span>
                )}
                <div className="block-controls-right">
                  <button onClick={() => moveBlock(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} title="Move down">↓</button>
                  <button className="remove" onClick={() => removeBlock(i)}>✕</button>
                </div>
              </div>

              {isOpen && block.type === 'text' && (
                <>
                  <textarea
                    placeholder="Type your message… use {{first_name}} to personalize"
                    value={block.content}
                    onChange={e => updateBlock(i, 'content', e.target.value)}
                    rows={3}
                  />
                  <div
                    className="char-count"
                    data-over={(block.content?.length || 0) > INSTAGRAM_TEXT_LIMIT}
                  >
                    {(block.content?.length || 0).toLocaleString()} / {INSTAGRAM_TEXT_LIMIT} chars
                    {(block.content?.length || 0) > INSTAGRAM_TEXT_LIMIT && ' — will be sent as multiple messages'}
                  </div>
                  <div className="token-chips">
                    {PERSONALIZATION_TOKENS.map(t => (
                      <button
                        key={t}
                        className="token-chip"
                        onClick={() => insertToken(i, t)}
                        title={`Insert ${t}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {isOpen && block.type === 'link' && (
                <input
                  type="url"
                  placeholder="https://your-link.com"
                  value={block.url}
                  onChange={e => updateBlock(i, 'url', e.target.value)}
                />
              )}

              {isOpen && block.type === 'button' && (
                <div className="button-block-fields">
                  <input
                    type="text"
                    placeholder="Button label (e.g. Get the link!)"
                    value={block.label}
                    onChange={e => updateBlock(i, 'label', e.target.value)}
                  />
                  <input
                    type="url"
                    placeholder="https://your-link.com"
                    value={block.url}
                    onChange={e => updateBlock(i, 'url', e.target.value)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="add-buttons">
        <button onClick={() => addBlock('text')}>+ Message</button>
        <button onClick={() => addBlock('link')}>+ Link</button>
        {buttonCount < 3 && (
          <button onClick={() => addBlock('button')} title="Tappable link button in DM">+ Button</button>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="preview">
          <p className="preview-label">DM Preview</p>
          <p className="preview-note">
            {plan.length === 1
              ? 'Arrives as 1 message.'
              : `Arrives as ${plan.length} separate messages, in this order.`}
            {' '}Line breaks are sent exactly as you typed them. Instagram DMs are plain
            text — *asterisks* and other markdown arrive as literal characters.
            {plan.some(m => m.splitInfo) && (
              <> A message over Instagram&rsquo;s 1000-character limit is split at paragraph
              breaks into several messages, marked below.</>
            )}
          </p>
          <div className="preview-thread">
            {plan.map((msg, i) => (
              <div key={i} className="preview-bubble">
                {plan.length > 1 && <span className="preview-bubble__index">{i + 1}</span>}
                <p className="preview-text">{msg.text || '…'}</p>
                {msg.splitInfo && (
                  <span className="preview-split-tag">
                    split {msg.splitInfo.part}/{msg.splitInfo.of} — over 1000 chars
                  </span>
                )}
                {msg.buttons.map((b, bi) => (
                  <div key={bi} className="preview-button">
                    <span>{b.title || 'Button'}</span>
                    {b.url && <span className="preview-button-url">{b.url}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {textBlockCount === 0 && (
            <p className="preview-warn">Add at least one message block to set context.</p>
          )}
        </div>
      )}
    </div>
  )
}
