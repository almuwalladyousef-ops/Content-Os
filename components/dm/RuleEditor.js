'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MessageBuilder from './MessageBuilder'
import ReelPicker from './ReelPicker'
import { confirmDialog, alertDialog } from '@/lib/dm/dialog'

const DEFAULT_TWO_STEP_PROMPT = 'Want me to send the link?'
const DEFAULT_TWO_STEP_BUTTON_TEXT = 'Send It In 5 min!'

const NEW_RULE = {
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

function iconPath(type) {
  if (type === 'trigger') return <><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/></>
  if (type === 'comment') return <><path d="M5 6.5h14v9H9l-4 3v-12Z"/><path d="M8 10h8M8 13h5"/></>
  if (type === 'message') return <><rect x="4" y="6" width="16" height="12" rx="2"/><path d="m5 8 7 5 7-5"/></>
  if (type === 'consent') return <><circle cx="12" cy="12" r="8"/><path d="M9 12.5 11 14l4-5"/></>
  if (type === 'target') return <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></>
  return <><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="11" cy="17" r="1.5"/></>
}

function WorkflowIcon({ type }) {
  return (
    <span className="flow-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {iconPath(type)}
      </svg>
    </span>
  )
}

function FlowNode({ id, type, label, detail, selected, onSelect, optional, children }) {
  return (
    <button
      type="button"
      className={`flow-node ${selected ? 'flow-node--selected' : ''}`}
      onClick={() => onSelect(id)}
      aria-pressed={selected}
    >
      <WorkflowIcon type={type} />
      <span className="flow-node__copy">
        <span className="flow-node__title-row">
          <strong>{label}</strong>
          {optional && <span className="flow-node__optional">Optional</span>}
        </span>
        <span className="flow-node__detail">{detail}</span>
        {children}
      </span>
      <span className="flow-node__edit" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m14 5 5 5M4 20l4.5-1 10-10a2 2 0 0 0-3-3l-10 10L4 20Z"/></svg>
      </span>
    </button>
  )
}

function Connector({ onClick, label = 'Add or edit step' }) {
  return (
    <div className="flow-connector" aria-hidden="true">
      <span className="flow-connector__line" />
      <button type="button" onClick={onClick} title={label} tabIndex={-1}>+</button>
      <span className="flow-connector__arrow">⌄</span>
    </div>
  )
}

function InspectorHeader({ title, description }) {
  return (
    <div className="flow-inspector__header">
      <div>
        <p className="flow-inspector__eyebrow">Selected step</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="flow-field">
      <span className="flow-field__label">{label}</span>
      {hint && <span className="flow-field__hint">{hint}</span>}
      {children}
    </label>
  )
}

function KeywordEditor({ value, input, setInput, onAdd, onRemove, placeholder, negative = false }) {
  return (
    <div className="flow-keyword-editor">
      <div className="keyword-input-row">
        <input
          value={input}
          placeholder={placeholder}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
        />
        <button type="button" onClick={onAdd}>Add</button>
      </div>
      <div className="keyword-tags">
        {value.map(keyword => (
          <span key={keyword} className={`tag ${negative ? 'tag--negative' : ''}`}>
            {keyword}
            <button type="button" onClick={() => onRemove(keyword)} aria-label={`Remove ${keyword}`}>×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function RuleEditor({ initial }) {
  const router = useRouter()
  const isNew = !initial?.id
  const initialWorkspaceId = initial?.workspaceId
  const initialInstagramId = initial?.igId
  const [workspaces, setWorkspaces] = useState([])
  const [allRules, setAllRules] = useState([])
  const [selectedStep, setSelectedStep] = useState('trigger')
  const [rule, setRule] = useState(() => {
    if (!initial) return { ...NEW_RULE }
    const commentReplies = initial.commentReplies?.length
      ? initial.commentReplies
      : initial.commentReply
        ? [initial.commentReply]
        : ['Sent you a DM.']
    return {
      ...NEW_RULE,
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

  useEffect(() => {
    Promise.all([
      fetch('/api/dm/workspaces').then(r => r.json()),
      fetch('/api/dm/rules').then(r => r.json()),
    ]).then(([workspaceData, rulesData]) => {
      setWorkspaces(workspaceData)
      setAllRules(rulesData)
      const inferred = initialWorkspaceId
        ? workspaceData.find(w => w.id === initialWorkspaceId)
        : workspaceData.find(w => w.igId === initialInstagramId)
      const workspace = isNew ? workspaceData.find(w => w.active) : inferred
      if (workspace) {
        setRule(current => ({
          ...current,
          workspaceId: workspace.id,
          igId: workspace.igId,
          targetReels: current.igId === workspace.igId ? current.targetReels : [],
          applyToAll: current.igId === workspace.igId ? current.applyToAll : false,
        }))
      }
    }).catch(() => {})
  }, [initialInstagramId, initialWorkspaceId, isNew])

  const selectedWorkspace = workspaces.find(w => w.id === rule.workspaceId) || workspaces.find(w => w.igId === rule.igId)
  const commentReplies = rule.commentReplies || ['Sent you a DM.']
  const firstMessage = rule.messages?.find(message => message.type === 'text')?.content?.trim()
  const buttonCount = rule.messages?.filter(message => message.type === 'button').length || 0

  const overlaps = useMemo(() => allRules.filter(candidate => {
    if (candidate.id === rule.id || !candidate.active || candidate.igId !== rule.igId) return false
    const reelOverlap = candidate.applyToAll || rule.applyToAll || candidate.targetReels?.some(id => rule.targetReels?.includes(id))
    return reelOverlap && rule.keywords.some(keyword => candidate.keywords?.includes(keyword))
  }), [allRules, rule])

  function set(key, value) {
    setRule(current => ({ ...current, [key]: value }))
    setError('')
  }

  function addKeyword(input, key, clear) {
    const keyword = input.trim().toLowerCase()
    if (!keyword || (rule[key] || []).includes(keyword)) return
    set(key, [...(rule[key] || []), keyword])
    clear('')
  }

  function updateReply(index, value) {
    const next = [...commentReplies]
    next[index] = value
    set('commentReplies', next)
  }

  function addReplyVariant() {
    const value = newReplyInput.trim()
    if (!value || commentReplies.length >= 5) return
    set('commentReplies', [...commentReplies, value])
    setNewReplyInput('')
  }

  function fail(message, step) {
    if (step) setSelectedStep(step)
    setError(message)
    requestAnimationFrame(() => document.getElementById('rule-editor-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  async function save() {
    if (!rule.name.trim()) return fail('Give this flow a name.', 'trigger')
    if (!rule.workspaceId) return fail('Select a workspace before creating this flow.', 'targeting')
    if (!rule.igId) return fail('Connect Instagram to this workspace before creating flows.', 'targeting')
    if (!rule.anyComment && rule.keywords.length === 0 && !rule.dmKeywords?.length) return fail('Add a comment keyword, enable any comment, or add a DM keyword.', 'trigger')
    if (rule.messages.length === 0) return fail('Add at least one private message.', 'message')
    if (!rule.applyToAll && rule.targetReels.length === 0 && !rule.dmKeywords?.length) return fail('Choose at least one reel, all reels, or a DM keyword.', 'targeting')

    setSaving(true)
    setError('')
    const cleanReplies = commentReplies.filter(reply => reply.trim())
    const payload = {
      ...rule,
      commentReply: undefined,
      commentReplies: cleanReplies.length ? cleanReplies : ['Sent you a DM.'],
      sendCap: rule.sendCap ? Number(rule.sendCap) : null,
      retriggerDays: rule.retriggerDays ? Number(rule.retriggerDays) : null,
      startDate: rule.startDate || null,
      endDate: rule.endDate || null,
    }
    const response = await fetch(isNew ? '/api/dm/rules' : `/api/dm/rules/${rule.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (response.ok) router.push('/dm/rules')
    else {
      const data = await response.json().catch(() => null)
      fail(data?.error ? `Failed to save: ${data.error}` : 'Failed to save. Try again.')
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
    const response = await fetch('/api/dm/rules?action=duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: rule.id }),
    })
    if (response.ok) router.push('/dm/rules')
    else setCloning(false)
  }

  async function resetLog() {
    if (!(await confirmDialog('Clear the DM history for this flow? Everyone who received it can receive it again.', { confirmLabel: 'Clear' }))) return
    setResetting(true)
    await fetch(`/api/dm/rules/${rule.id}?action=reset-log`, { method: 'POST' })
    setResetting(false)
    await alertDialog('DM history cleared.')
  }

  async function testSend() {
    if (!testUserId.trim()) return setTestResult({ error: 'Enter an Instagram user ID.' })
    setTestSending(true)
    setTestResult(null)
    const response = await fetch(`/api/dm/rules/${rule.id}?action=test-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: testUserId.trim() }),
    })
    const data = await response.json()
    setTestResult(response.ok ? { success: true } : { error: data.error })
    setTestSending(false)
  }

  function renderInspector() {
    if (selectedStep === 'trigger') return (
      <>
        <InspectorHeader title="Instagram comment" description="Choose which comments start this flow." />
        <div className="flow-inspector__body">
          <label className="flow-switch-row">
            <span><strong>Any comment</strong><small>Run this flow for every comment.</small></span>
            <input type="checkbox" checked={rule.anyComment} onChange={e => set('anyComment', e.target.checked)} />
          </label>
          {!rule.anyComment && <>
            <Field label="Comment keywords" hint="A comment can contain any of these words.">
              <KeywordEditor
                value={rule.keywords}
                input={keywordInput}
                setInput={setKeywordInput}
                onAdd={() => addKeyword(keywordInput, 'keywords', setKeywordInput)}
                onRemove={keyword => set('keywords', rule.keywords.filter(item => item !== keyword))}
                placeholder="Try guide or link"
              />
            </Field>
            {rule.keywords.length > 1 && <Field label="Match behavior">
              <div className="flow-segmented">
                <button type="button" className={rule.matchMode !== 'all' ? 'active' : ''} onClick={() => set('matchMode', 'any')}>Any keyword</button>
                <button type="button" className={rule.matchMode === 'all' ? 'active' : ''} onClick={() => set('matchMode', 'all')}>All keywords</button>
              </div>
            </Field>}
            <label className="flow-check-row"><input type="checkbox" checked={rule.exactMatch} onChange={e => set('exactMatch', e.target.checked)} /><span>Match exact words only</span></label>
            <Field label="Exclude comments containing" hint="These words prevent the flow from running.">
              <KeywordEditor
                value={rule.negativeKeywords || []}
                input={negKwInput}
                setInput={setNegKwInput}
                onAdd={() => addKeyword(negKwInput, 'negativeKeywords', setNegKwInput)}
                onRemove={keyword => set('negativeKeywords', (rule.negativeKeywords || []).filter(item => item !== keyword))}
                placeholder="Try spam"
                negative
              />
            </Field>
          </>}
          {overlaps.length > 0 && <div className="flow-notice flow-notice--warn">Keywords overlap with {overlaps.map(item => item.name).join(', ')}. Both flows may run.</div>}
        </div>
      </>
    )

    if (selectedStep === 'reply') return (
      <>
        <InspectorHeader title="Public reply" description="Reply under the comment after the DM is sent." />
        <div className="flow-inspector__body">
          <p className="flow-help">Add up to five variants. Content OS picks one at random so replies feel less repetitive.</p>
          <div className="comment-replies-list">
            {commentReplies.map((reply, index) => (
              <div key={index} className="comment-reply-row">
                <textarea rows={3} value={reply} onChange={e => updateReply(index, e.target.value)} placeholder="Sent you a DM." />
                {commentReplies.length > 1 && <button type="button" className="remove-reply-btn" onClick={() => set('commentReplies', commentReplies.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
              </div>
            ))}
          </div>
          {commentReplies.length < 5 && <div className="keyword-input-row">
            <input value={newReplyInput} onChange={e => setNewReplyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addReplyVariant()} placeholder="Another reply variant" />
            <button type="button" onClick={addReplyVariant}>Add</button>
          </div>}
        </div>
      </>
    )

    if (selectedStep === 'consent') return (
      <>
        <InspectorHeader title="Two-step opt-in" description="Ask for a tap before delivering the main message." />
        <div className="flow-inspector__body">
          <label className="flow-switch-row">
            <span><strong>Require opt-in</strong><small>Recommended when your message contains a link.</small></span>
            <input type="checkbox" checked={rule.twoStep} onChange={e => set('twoStep', e.target.checked)} />
          </label>
          {rule.twoStep && <>
            <Field label="First message"><textarea rows={4} value={rule.twoStepPrompt} onChange={e => set('twoStepPrompt', e.target.value)} placeholder={DEFAULT_TWO_STEP_PROMPT} /></Field>
            <Field label="Quick reply button"><input value={rule.twoStepButtonText} onChange={e => set('twoStepButtonText', e.target.value)} placeholder={DEFAULT_TWO_STEP_BUTTON_TEXT} /></Field>
            <div className="flow-message-preview"><span>{rule.twoStepPrompt || DEFAULT_TWO_STEP_PROMPT}</span><button type="button">{rule.twoStepButtonText || DEFAULT_TWO_STEP_BUTTON_TEXT}</button></div>
          </>}
        </div>
      </>
    )

    if (selectedStep === 'message') return (
      <>
        <InspectorHeader title="Send private reply" description="Build the DM sent to the person who triggered this flow." />
        <div className="flow-inspector__body">
          <MessageBuilder messages={rule.messages} onChange={messages => set('messages', messages)} />
          <div className="flow-notice"><strong>Instagram delivery limit</strong><br />Only one initial private reply can be sent from a comment. Follow-up messages require the person to respond.</div>
        </div>
      </>
    )

    if (selectedStep === 'targeting') return (
      <>
        <InspectorHeader title="Audience and reels" description="Choose where this flow runs and who can receive it again." />
        <div className="flow-inspector__body">
          {!rule.igId && <div className="flow-notice flow-notice--warn">Connect Instagram to {selectedWorkspace?.name || 'this workspace'} before saving. <a href="/api/auth/instagram/connect">Connect Instagram</a></div>}
          <Field label="Reels"><ReelPicker igId={rule.igId} selected={rule.targetReels} applyToAll={rule.applyToAll} onChange={({ targetReels, applyToAll }) => setRule(current => ({ ...current, targetReels, applyToAll }))} /></Field>
          <Field label="Also trigger from incoming DMs" hint="Run this flow when someone directly messages one of these words.">
            <KeywordEditor
              value={rule.dmKeywords || []}
              input={dmKwInput}
              setInput={setDmKwInput}
              onAdd={() => addKeyword(dmKwInput, 'dmKeywords', setDmKwInput)}
              onRemove={keyword => set('dmKeywords', (rule.dmKeywords || []).filter(item => item !== keyword))}
              placeholder="Try price"
            />
          </Field>
        </div>
      </>
    )

    return (
      <>
        <InspectorHeader title="Limits and schedule" description="Control frequency, repeat delivery, and active dates." />
        <div className="flow-inspector__body">
          <Field label="Daily send cap" hint="Leave blank for unlimited."><input type="number" min="1" value={rule.sendCap || ''} onChange={e => set('sendCap', e.target.value)} placeholder="100" /></Field>
          <Field label="Allow repeat after" hint="Days before the same person can trigger this flow again."><input type="number" min="1" value={rule.retriggerDays || ''} onChange={e => set('retriggerDays', e.target.value)} placeholder="Never" /></Field>
          <div className="flow-date-grid">
            <Field label="Starts"><input type="date" value={rule.startDate || ''} onChange={e => set('startDate', e.target.value)} /></Field>
            <Field label="Ends"><input type="date" value={rule.endDate || ''} onChange={e => set('endDate', e.target.value)} /></Field>
          </div>
          {!isNew && <div className="flow-test-panel">
            <h3>Test this flow</h3>
            <p>Send the current message to your Instagram user ID.</p>
            <div className="keyword-input-row"><input value={testUserId} onChange={e => setTestUserId(e.target.value)} placeholder="Instagram user ID" /><button type="button" onClick={testSend} disabled={testSending}>{testSending ? 'Sending…' : 'Send test'}</button></div>
            {testResult?.success && <p className="success-msg">DM sent. Check your inbox.</p>}
            {testResult?.error && <p className="error">{testResult.error}</p>}
          </div>}
        </div>
      </>
    )
  }

  return (
    <div className="visual-rule-editor">
      <header className="visual-rule-editor__topbar">
        <div className="flow-title-group">
          <button type="button" className="flow-back" onClick={() => router.push('/dm/rules')} aria-label="Back to flows">←</button>
          <div>
            <input className="flow-title-input" value={rule.name} onChange={e => set('name', e.target.value)} placeholder="Untitled flow" />
            <div className="flow-title-meta">
              <span className={`flow-status-dot ${rule.active ? 'active' : ''}`} />
              {rule.active ? 'Active after save' : 'Paused'}
              {selectedWorkspace?.name && <><span>·</span><span>{selectedWorkspace.name}</span></>}
            </div>
          </div>
        </div>
        <div className="flow-top-actions">
          <label className="flow-active-control"><input type="checkbox" checked={rule.active} onChange={e => set('active', e.target.checked)} /><span>{rule.active ? 'Active' : 'Paused'}</span></label>
          <button type="button" className="btn-cancel" onClick={() => router.push('/dm/rules')}>Cancel</button>
          <button type="button" className="btn-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create flow' : 'Save changes'}</button>
        </div>
      </header>

      {error && <div id="rule-editor-error" className="flow-error"><strong>Flow needs attention</strong><span>{error}</span></div>}

      <div className="flow-mobile-stepbar" aria-label="Flow steps">
        {[
          ['trigger', 'Trigger'], ['reply', 'Reply'], ['consent', 'Opt-in'], ['message', 'DM'], ['targeting', 'Reels'], ['controls', 'Controls'],
        ].map(([id, label]) => <button type="button" key={id} className={selectedStep === id ? 'active' : ''} onClick={() => setSelectedStep(id)}>{label}</button>)}
      </div>

      <div className="flow-workspace">
        <main className="flow-canvas">
          <div className="flow-canvas__heading">
            <div><span className="micro">Comment to DM</span><h1>Flow</h1></div>
            <p>Select a step to edit it. The flow runs from top to bottom.</p>
          </div>
          <div className="flow-track">
            <FlowNode id="trigger" type="trigger" label="Instagram comment" detail={rule.anyComment ? 'When anyone comments' : rule.keywords.length ? `Contains ${rule.keywords.slice(0, 3).join(', ')}` : 'Add comment keywords'} selected={selectedStep === 'trigger'} onSelect={setSelectedStep}>
              <span className="flow-node__chips">
                {rule.anyComment ? <i>Any comment</i> : rule.keywords.slice(0, 3).map(keyword => <i key={keyword}>{keyword}</i>)}
              </span>
            </FlowNode>
            <Connector onClick={() => setSelectedStep('reply')} />
            <FlowNode id="reply" type="comment" label="Public reply" detail={commentReplies[0]?.trim() || 'Add a public reply'} selected={selectedStep === 'reply'} onSelect={setSelectedStep} />
            <Connector onClick={() => setSelectedStep('consent')} />
            <FlowNode id="consent" type="consent" label="Ask for permission" detail={rule.twoStep ? (rule.twoStepPrompt || DEFAULT_TWO_STEP_PROMPT) : 'Skipped in this flow'} selected={selectedStep === 'consent'} onSelect={setSelectedStep} optional>
              <span className={`flow-node__state ${rule.twoStep ? 'on' : ''}`}>{rule.twoStep ? 'Enabled' : 'Off'}</span>
            </FlowNode>
            <Connector onClick={() => setSelectedStep('message')} />
            <FlowNode id="message" type="message" label="Send private reply" detail={firstMessage || 'Build your DM message'} selected={selectedStep === 'message'} onSelect={setSelectedStep}>
              <span className="flow-node__summary">{rule.messages.length} block{rule.messages.length === 1 ? '' : 's'}{buttonCount ? ` · ${buttonCount} button${buttonCount === 1 ? '' : 's'}` : ''}</span>
            </FlowNode>
            <Connector onClick={() => setSelectedStep('targeting')} />
            <FlowNode id="targeting" type="target" label="Audience and reels" detail={rule.applyToAll ? 'All current and future reels' : rule.targetReels.length ? `${rule.targetReels.length} selected reel${rule.targetReels.length === 1 ? '' : 's'}` : 'Choose where this flow runs'} selected={selectedStep === 'targeting'} onSelect={setSelectedStep} />
            <Connector onClick={() => setSelectedStep('controls')} />
            <FlowNode id="controls" type="controls" label="Limits and schedule" detail={rule.sendCap ? `${rule.sendCap} DMs per day` : 'No daily cap'} selected={selectedStep === 'controls'} onSelect={setSelectedStep} optional />
          </div>
        </main>

        <aside className="flow-inspector">{renderInspector()}</aside>
      </div>

      {!isNew && <footer className="flow-management">
        <div><strong>Flow management</strong><span>Created {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString() : 'recently'}{rule.updatedAt ? ` · Updated ${new Date(rule.updatedAt).toLocaleDateString()}` : ''}</span></div>
        <div>
          <button type="button" className="btn-clone" onClick={cloneRule} disabled={cloning}>{cloning ? 'Duplicating…' : 'Duplicate'}</button>
          <button type="button" className="btn-reset" onClick={resetLog} disabled={resetting}>{resetting ? 'Clearing…' : 'Reset DM history'}</button>
          <button type="button" className="btn-delete" onClick={deleteRule}>Delete flow</button>
        </div>
      </footer>}
    </div>
  )
}
