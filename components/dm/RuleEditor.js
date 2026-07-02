'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MessageBuilder from './MessageBuilder'
import ReelPicker from './ReelPicker'
import { getStoredWorkspaceId, resolveActiveWorkspace, storeWorkspaceId } from './WorkspaceSwitcher'
import { confirmDialog, alertDialog } from '@/lib/dm/dialog'

const DEFAULT_TWO_STEP_PROMPT = 'Want me to send the link?'
const DEFAULT_TWO_STEP_BUTTON_TEXT = 'Send It In 5 min!'

function Section({ id, title, open, onToggle, children, mandatory, alwaysOpen }) {
  return (
    <section id={id} className={`rule-section ${mandatory ? 'section--mandatory' : ''}`}>
      {alwaysOpen ? (
        <div className="section-header section-header--static">
          <span className="section-title">{title}</span>
          {mandatory && <span className="section-required">Required</span>}
        </div>
      ) : (
        <button className="section-header" type="button" onClick={onToggle}>
          <span className="section-title">{title}</span>
          <div className="section-header-right">
            {mandatory && <span className="section-required">Required</span>}
            <span className="section-chevron">{open ? '▾' : '▸'}</span>
          </div>
        </button>
      )}
      {(alwaysOpen || open) && <div className="section-body">{children}</div>}
    </section>
  )
}

export default function RuleEditor({ initial }) {
  const router = useRouter()
  const isNew = !initial?.id

  const [workspaces, setWorkspaces] = useState([])
  const [allRules, setAllRules] = useState([])
  const [rule, setRule] = useState(() => {
    if (!initial) return {
      name: '',
      active: true,
      workspaceId: null,
      igId: null,
      applyToAll: false,
      targetReels: [],
      keywords: [],
      matchMode: 'any',
      exactMatch: false,
      negativeKeywords: [],
      anyComment: false,
      dmKeywords: [],
      perKeywordMessages: {},
      messages: [],
      twoStep: false,
      twoStepPrompt: DEFAULT_TWO_STEP_PROMPT,
      twoStepButtonText: DEFAULT_TWO_STEP_BUTTON_TEXT,
      fallbackMessage: '',
      commentReplies: ['Sent you a DM.'],
      sendCap: '',
      retriggerDays: '',
      startDate: '',
      endDate: '',
    }
    // Migrate old commentReply string → commentReplies array
    const commentReplies = initial.commentReplies?.length
      ? initial.commentReplies
      : initial.commentReply
        ? [initial.commentReply]
        : ['Sent you a DM.']
    return {
      ...initial,
      twoStepPrompt: initial.twoStepPrompt || DEFAULT_TWO_STEP_PROMPT,
      twoStepButtonText: initial.twoStepButtonText || DEFAULT_TWO_STEP_BUTTON_TEXT,
      commentReplies,
    }
  })

  const [keywordInput, setKeywordInput] = useState('')
  const [negKwInput, setNegKwInput] = useState('')
  const [dmKwInput, setDmKwInput] = useState('')
  const [newReplyInput, setNewReplyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testUserId, setTestUserId] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [error, setError] = useState('')
  const [sectionOpen, setSectionOpen] = useState({})

  function toggleSection(key) {
    setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function jumpToSection(id, openKey) {
    if (openKey) setSectionOpen(prev => ({ ...prev, [openKey]: true }))
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/dm/workspaces').then(r => r.json()),
      fetch('/api/dm/rules').then(r => r.json()),
    ]).then(([wss, rls]) => {
      setWorkspaces(wss)
      setAllRules(rls)
      const storedId = getStoredWorkspaceId()
      const inferred = initial?.workspaceId
        ? wss.find(w => w.id === initial.workspaceId)
        : wss.find(w => w.igId === initial?.igId)
      const workspace = isNew ? resolveActiveWorkspace(wss, storedId) : inferred
      if (workspace) {
        if (isNew) storeWorkspaceId(workspace.id)
        setRule(r => ({
          ...r,
          workspaceId: workspace.id,
          igId: workspace.igId,
          targetReels: r.igId === workspace.igId ? r.targetReels : [],
          applyToAll: r.igId === workspace.igId ? r.applyToAll : false,
        }))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    function handleWorkspaceChange(event) {
      if (!isNew) return
      const workspace = workspaces.find(w => w.id === event.detail?.id)
      if (!workspace) return
      setRule(r => ({
        ...r,
        workspaceId: workspace.id,
        igId: workspace.igId,
        targetReels: r.igId === workspace.igId ? r.targetReels : [],
        applyToAll: r.igId === workspace.igId ? r.applyToAll : false,
      }))
    }

    window.addEventListener('workspacechange', handleWorkspaceChange)
    return () => window.removeEventListener('workspacechange', handleWorkspaceChange)
  }, [isNew, workspaces])

  const overlaps = allRules.filter(r => {
    if (r.id === rule.id || !r.active) return false
    if (r.igId !== rule.igId) return false
    const reelOverlap = r.applyToAll || rule.applyToAll || r.targetReels?.some(id => rule.targetReels?.includes(id))
    if (!reelOverlap) return false
    return rule.keywords.some(kw => r.keywords?.includes(kw))
  })

  function set(key, val) { setRule(r => ({ ...r, [key]: val })) }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase()
    if (!kw || rule.keywords.includes(kw)) return
    set('keywords', [...rule.keywords, kw])
    setKeywordInput('')
  }

  function addNegKeyword() {
    const kw = negKwInput.trim().toLowerCase()
    if (!kw || (rule.negativeKeywords || []).includes(kw)) return
    set('negativeKeywords', [...(rule.negativeKeywords || []), kw])
    setNegKwInput('')
  }

  function addDmKeyword() {
    const kw = dmKwInput.trim().toLowerCase()
    if (!kw || (rule.dmKeywords || []).includes(kw)) return
    set('dmKeywords', [...(rule.dmKeywords || []), kw])
    setDmKwInput('')
  }

  function addReplyVariant() {
    const text = newReplyInput.trim()
    if (!text || (rule.commentReplies || []).length >= 5) return
    set('commentReplies', [...(rule.commentReplies || []), text])
    setNewReplyInput('')
  }

  function updateReply(index, value) {
    const next = [...(rule.commentReplies || [])]
    next[index] = value
    set('commentReplies', next)
  }

  function removeReply(index) {
    set('commentReplies', (rule.commentReplies || []).filter((_, i) => i !== index))
  }

  async function save() {
    if (!rule.name) return setError('Give this rule a name.')
    if (!rule.workspaceId) return setError('Select a workspace before creating a rule.')
    if (!rule.igId) return setError('Connect an Instagram account to this workspace before creating rules.')
    if (!rule.anyComment && rule.keywords.length === 0 && !rule.dmKeywords?.length) {
      return setError('Add at least one keyword, enable "Any comment", or add DM keywords.')
    }
    if (rule.messages.length === 0) return setError('Add at least one message.')
    if (!rule.applyToAll && rule.targetReels.length === 0 && !rule.dmKeywords?.length) {
      return setError('Select at least one reel, enable Apply to all, or add DM keywords.')
    }

    setSaving(true)
    setError('')

    const commentReplies = (rule.commentReplies || []).filter(r => r.trim())
    const payload = {
      ...rule,
      commentReply: undefined,
      commentReplies: commentReplies.length ? commentReplies : ['Sent you a DM.'],
      sendCap: rule.sendCap ? Number(rule.sendCap) : null,
      retriggerDays: rule.retriggerDays ? Number(rule.retriggerDays) : null,
      startDate: rule.startDate || null,
      endDate: rule.endDate || null,
    }

    const method = isNew ? 'POST' : 'PUT'
    const url = isNew ? '/api/dm/rules' : `/api/dm/rules/${rule.id}`

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/dm/rules')
    } else {
      setError('Failed to save. Try again.')
      setSaving(false)
    }
  }

  async function deleteRule() {
    if (!(await confirmDialog(`Delete "${rule.name}"? This cannot be undone.`, { confirmLabel: 'Delete', danger: true }))) return
    await fetch(`/api/dm/rules/${rule.id}`, { method: 'DELETE' })
    router.push('/dm/rules')
  }

  async function cloneRule() {
    setCloning(true)
    const res = await fetch(`/api/dm/rules?action=duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: rule.id }),
    })
    if (res.ok) router.push('/dm/rules')
    else setCloning(false)
  }

  async function resetLog() {
    if (!(await confirmDialog('Clear the DM history for this rule? Everyone who was DMed can be DMed again.', { confirmLabel: 'Clear' }))) return
    setResetting(true)
    await fetch(`/api/dm/rules/${rule.id}?action=reset-log`, { method: 'POST' })
    setResetting(false)
    await alertDialog('DM history cleared.')
  }

  async function testSend() {
    if (!testUserId.trim()) return setTestResult({ error: 'Enter an Instagram user ID.' })
    setTestSending(true)
    setTestResult(null)
    const res = await fetch(`/api/dm/rules/${rule.id}?action=test-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: testUserId.trim() }),
    })
    const data = await res.json()
    setTestResult(res.ok ? { success: true } : { error: data.error })
    setTestSending(false)
  }

  const selectedWorkspace = workspaces.find(w => w.id === rule.workspaceId) || workspaces.find(w => w.igId === rule.igId)
  const commentReplies = rule.commentReplies || ['Sent you a DM.']
  const twoStepPromptPreview = rule.twoStepPrompt?.trim() || DEFAULT_TWO_STEP_PROMPT
  const twoStepButtonPreview = rule.twoStepButtonText?.trim() || DEFAULT_TWO_STEP_BUTTON_TEXT

  return (
    <div className="rule-editor">
      <div className="editor-header">
        <input
          className="rule-name-input"
          placeholder="Rule name (e.g. Summer sale)"
          value={rule.name}
          onChange={e => set('name', e.target.value)}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={rule.active}
            onChange={e => set('active', e.target.checked)}
          />
          Active
        </label>
      </div>

      {!isNew && (
        <div className="editor-meta">
          {rule.createdAt && <span>Created {new Date(rule.createdAt).toLocaleDateString()}</span>}
          {rule.updatedAt && <span>· Updated {new Date(rule.updatedAt).toLocaleDateString()}</span>}
        </div>
      )}

      <div className="rule-flow-tabs" aria-label="Rule setup flow">
        <button type="button" onClick={() => jumpToSection('rule-comments', 'triggers')}>Comments</button>
        <button type="button" onClick={() => jumpToSection('rule-dm-message', 'message')}>DM</button>
        <button type="button" onClick={() => jumpToSection('rule-reels')}>Reels</button>
        <button type="button" onClick={() => jumpToSection('rule-controls', 'controls')}>Controls</button>
      </div>

      <Section id="rule-comments" title="1. Comment Triggers" mandatory open={!!sectionOpen.triggers} onToggle={() => toggleSection('triggers')}>
        <p className="hint">When to send the DM based on comment content.</p>
        <label className="toggle" style={{ marginBottom: '16px' }}>
          <input type="checkbox" checked={rule.anyComment} onChange={e => set('anyComment', e.target.checked)} />
          Trigger on <strong>any comment</strong> (no keyword needed)
        </label>
        {!rule.anyComment && (
          <>
            <div className="keyword-input-row">
              <input
                placeholder="e.g. link"
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKeyword()}
              />
              <button type="button" onClick={addKeyword}>Add</button>
            </div>
            <div className="keyword-tags">
              {rule.keywords.map(kw => (
                <span key={kw} className="tag">
                  {kw}
                  <button type="button" onClick={() => set('keywords', rule.keywords.filter(k => k !== kw))}>✕</button>
                </span>
              ))}
            </div>
            {rule.keywords.length > 1 && (
              <div className="match-mode-row">
                <span className="hint" style={{ marginBottom: 0 }}>Match mode:</span>
                <label className="toggle">
                  <input type="radio" name="matchMode" checked={rule.matchMode !== 'all'} onChange={() => set('matchMode', 'any')} />
                  Any keyword
                </label>
                <label className="toggle">
                  <input type="radio" name="matchMode" checked={rule.matchMode === 'all'} onChange={() => set('matchMode', 'all')} />
                  All keywords
                </label>
              </div>
            )}
            <label className="toggle" style={{ marginTop: '12px' }}>
              <input type="checkbox" checked={rule.exactMatch} onChange={e => set('exactMatch', e.target.checked)} />
              Exact word match (won't trigger on "linking" for keyword "link")
            </label>
            <div style={{ marginTop: '16px' }}>
              <p className="hint">Negative keywords — block trigger if comment contains these:</p>
              <div className="keyword-input-row">
                <input
                  placeholder="e.g. spam"
                  value={negKwInput}
                  onChange={e => setNegKwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNegKeyword()}
                />
                <button type="button" onClick={addNegKeyword}>Add</button>
              </div>
              <div className="keyword-tags">
                {(rule.negativeKeywords || []).map(kw => (
                  <span key={kw} className="tag tag--negative">
                    {kw}
                    <button type="button" onClick={() => set('negativeKeywords', (rule.negativeKeywords || []).filter(k => k !== kw))}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        {overlaps.length > 0 && (
          <div className="overlap-warning">
            ⚠ Keyword overlap with: {overlaps.map(r => <strong key={r.id}>{r.name}</strong>).reduce((a, b) => [a, ', ', b])}. Both rules may fire on the same comment.
          </div>
        )}
      </Section>

      <Section id="rule-dm-keywords" title="2. DM Keyword Triggers (optional)" open={!!sectionOpen.dmkw} onToggle={() => toggleSection('dmkw')}>
        <p className="hint">Also trigger this rule when someone DMs you one of these words directly.</p>
        <div className="keyword-input-row">
          <input
            placeholder="e.g. price"
            value={dmKwInput}
            onChange={e => setDmKwInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDmKeyword()}
          />
          <button type="button" onClick={addDmKeyword}>Add</button>
        </div>
        <div className="keyword-tags">
          {(rule.dmKeywords || []).map(kw => (
            <span key={kw} className="tag tag--dm">
              {kw}
              <button type="button" onClick={() => set('dmKeywords', (rule.dmKeywords || []).filter(k => k !== kw))}>✕</button>
            </span>
          ))}
        </div>
      </Section>

      <Section id="rule-two-step" title="3. Two-Step Opt-In" open={!!sectionOpen.twostep} onToggle={() => toggleSection('twostep')}>
        <p className="hint">Send the first DM as a prompt with a tappable button. When they tap it, the DM message in step 4 gets sent.</p>
        <label className="toggle" style={{ marginBottom: '16px' }}>
          <input
            type="checkbox"
            checked={rule.twoStep}
            onChange={e => {
              const checked = e.target.checked
              setRule(r => ({
                ...r,
                twoStep: checked,
                twoStepPrompt: r.twoStepPrompt || DEFAULT_TWO_STEP_PROMPT,
                twoStepButtonText: r.twoStepButtonText || DEFAULT_TWO_STEP_BUTTON_TEXT,
              }))
            }}
          />
          Enable two-step opt-in
        </label>
        {rule.twoStep && (
          <div className="two-step-fields">
            <div className="two-step-config">
              <label className="field-label">First DM message</label>
              <textarea
                placeholder={DEFAULT_TWO_STEP_PROMPT}
                value={rule.twoStepPrompt}
                onChange={e => set('twoStepPrompt', e.target.value)}
                rows={3}
              />
              <label className="field-label" style={{ marginTop: '12px' }}>Button label</label>
              <input
                type="text"
                placeholder={DEFAULT_TWO_STEP_BUTTON_TEXT}
                value={rule.twoStepButtonText}
                onChange={e => set('twoStepButtonText', e.target.value)}
              />
            </div>
            <div className="two-step-preview" aria-label="Two-step DM preview">
              <p className="preview-label">Recipient DM Preview</p>
              <div className="two-step-dm-bubble">
                <p>{twoStepPromptPreview}</p>
                <div className="two-step-dm-button">{twoStepButtonPreview}</div>
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section id="rule-dm-message" title="4. DM Message" mandatory open={!!sectionOpen.message} onToggle={() => toggleSection('message')}>
        <p className="hint">The message sent to the commenter. Use {`{{first_name}}`} to personalize.</p>
        <MessageBuilder
          messages={rule.messages}
          onChange={messages => set('messages', messages)}
        />
      </Section>

      <Section id="rule-comment-reply" title="5. Comment Reply" open={!!sectionOpen.reply} onToggle={() => toggleSection('reply')}>
        <p className="hint">
          Public reply posted under the comment after the DM is sent. Add up to 5 variants — one is picked at random each time.
        </p>
        <div className="comment-replies-list">
          {commentReplies.map((reply, i) => (
            <div key={i} className="comment-reply-row">
              <textarea
                value={reply}
                onChange={e => updateReply(i, e.target.value)}
                rows={2}
                placeholder="e.g. Sent you a DM! 📩"
              />
              {commentReplies.length > 1 && (
                <button type="button" className="remove-reply-btn" onClick={() => removeReply(i)}>✕</button>
              )}
            </div>
          ))}
        </div>
        {commentReplies.length < 5 && (
          <div className="keyword-input-row" style={{ marginTop: '10px' }}>
            <input
              placeholder="Add another reply variant…"
              value={newReplyInput}
              onChange={e => setNewReplyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addReplyVariant()}
            />
            <button type="button" onClick={addReplyVariant}>Add variant</button>
          </div>
        )}
        <p className="hint" style={{ marginTop: '8px' }}>
          {commentReplies.length} variant{commentReplies.length !== 1 ? 's' : ''} — each comment gets one picked at random.
        </p>
      </Section>

      <Section id="rule-controls" title="6. Controls" open={!!sectionOpen.controls} onToggle={() => toggleSection('controls')}>
        <div className="controls-grid">
          <div className="control-group">
            <label className="field-label">Daily send cap</label>
            <p className="hint">Max DMs this rule sends per day (leave blank = unlimited).</p>
            <input
              type="number"
              min="1"
              placeholder="e.g. 100"
              value={rule.sendCap || ''}
              onChange={e => set('sendCap', e.target.value)}
            />
          </div>
          <div className="control-group">
            <label className="field-label">Re-trigger after (days)</label>
            <p className="hint">Allow the same person to get this DM again after N days. Leave blank = never re-trigger.</p>
            <input
              type="number"
              min="1"
              placeholder="e.g. 30"
              value={rule.retriggerDays || ''}
              onChange={e => set('retriggerDays', e.target.value)}
            />
          </div>
          <div className="control-group">
            <label className="field-label">Start date</label>
            <p className="hint">Rule won't fire before this date.</p>
            <input
              type="date"
              value={rule.startDate || ''}
              onChange={e => set('startDate', e.target.value)}
            />
          </div>
          <div className="control-group">
            <label className="field-label">End / expiry date</label>
            <p className="hint">Rule auto-stops firing after this date.</p>
            <input
              type="date"
              value={rule.endDate || ''}
              onChange={e => set('endDate', e.target.value)}
            />
          </div>
        </div>
      </Section>

      {!isNew && (
        <Section id="rule-test-send" title="Test Send" open={!!sectionOpen.test} onToggle={() => toggleSection('test')}>
          <p className="hint">Send a test DM to your own Instagram user ID to preview the message.</p>
          <div className="keyword-input-row">
            <input
              placeholder="Your Instagram user ID"
              value={testUserId}
              onChange={e => setTestUserId(e.target.value)}
            />
            <button type="button" onClick={testSend} disabled={testSending}>
              {testSending ? 'Sending…' : 'Send test'}
            </button>
          </div>
          {testResult?.success && <p className="success-msg">DM sent! Check your inbox.</p>}
          {testResult?.error && <p className="error">{testResult.error}</p>}
        </Section>
      )}

      <Section id="rule-reels" title="7. Target Reels" mandatory alwaysOpen>
        <p className="hint">
          {selectedWorkspace?.igId
            ? `Reels from ${selectedWorkspace.name}.`
            : 'Connect an Instagram account to this workspace first.'}
        </p>
        <ReelPicker
          igId={rule.igId}
          selected={rule.targetReels}
          applyToAll={rule.applyToAll}
          onChange={({ targetReels, applyToAll }) => setRule(r => ({ ...r, targetReels, applyToAll }))}
        />
      </Section>

      {error && <p className="error">{error}</p>}

      <div className="editor-actions">
        <button className="btn-save" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Rule'}
        </button>
        {!isNew && (
          <>
            <button className="btn-clone" onClick={cloneRule} disabled={cloning}>
              {cloning ? 'Cloning…' : 'Duplicate'}
            </button>
            <button className="btn-reset" onClick={resetLog} disabled={resetting}>
              {resetting ? 'Clearing…' : 'Reset DM History'}
            </button>
            <button className="btn-delete" onClick={deleteRule}>Delete</button>
          </>
        )}
        <button className="btn-cancel" onClick={() => router.push('/dm/rules')}>Cancel</button>
      </div>
    </div>
  )
}
