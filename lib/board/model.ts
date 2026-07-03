/**
 * Vault board data model — a faithful port of the logic in
 * home-server/board/content-os.html so the native /board page reads and writes
 * the exact same markdown files (same folders, frontmatter, and graph links).
 */

export type CardStatus =
  | 'research' | 'script' | 'ready-to-film' | 'film-today'
  | 'filmed' | 'ready-to-post' | 'posted' | 'archive'

export type ResearchBucket = 'accounts' | 'daily' | 'reels' | 'weekly' | 'urgent'

export interface RawFile {
  name: string
  path: string
  data: Record<string, string | null>
  body: string
  content: string
}

export interface Card extends RawFile {
  title: string
  account: string | null
  format: string | null
  status: CardStatus | null
  rtype: ResearchBucket | null
}

export const ALIAS: Record<string, CardStatus> = {
  'script-draft': 'script', pipeline: 'script', published: 'posted', post: 'posted',
  film: 'film-today', skip: 'archive', skipped: 'archive', archived: 'archive',
}

export const FLOW: { key: CardStatus; label: string; color: string }[] = [
  { key: 'research',      label: 'Research',      color: 'oklch(0.80 0.16 80)' },
  { key: 'script',        label: 'Script',        color: 'oklch(0.68 0.14 255)' },
  { key: 'ready-to-film', label: 'Ready to Film', color: 'oklch(0.75 0.12 210)' },
  { key: 'film-today',    label: 'Film Today',    color: 'oklch(0.74 0.15 160)' },
  { key: 'filmed',        label: 'Filmed',        color: 'oklch(0.80 0.16 130)' },
  { key: 'ready-to-post', label: 'Scheduled',     color: 'oklch(0.74 0.15 55)' },
  { key: 'posted',        label: 'Posted',        color: 'oklch(0.65 0.02 255)' },
  { key: 'archive',       label: 'Archive',       color: 'oklch(0.58 0.03 255)' },
]
export const FLOW_MAP = Object.fromEntries(FLOW.map(s => [s.key, s]))
export const NEXT: Partial<Record<CardStatus, CardStatus>> = {
  research: 'script', script: 'ready-to-film', 'ready-to-film': 'film-today',
  'film-today': 'filmed', filmed: 'ready-to-post', 'ready-to-post': 'posted',
}
export const BOARD_COLUMNS = FLOW.filter(s => s.key !== 'research' && s.key !== 'archive')

export const ACCOUNT_META = [
  { key: 'traceback',    label: 'Traceback' },
  { key: 'personal-ai',  label: 'Personal AI' },
  { key: 'motivational', label: 'Motivational' },
]
export const FORMAT_META = [
  { key: 'short-form', label: 'Short Form' },
  { key: 'long-form',  label: 'Long Form' },
  { key: 'x',          label: 'X' },
  { key: 'carousel',   label: 'Carousels' },
  { key: 'story',      label: 'Stories' },
]
export const RESEARCH_BUCKETS: { key: ResearchBucket; label: string; purpose: string }[] = [
  { key: 'daily',  label: 'Daily Topics', purpose: 'Loose topic ideas and quick finds worth checking today.' },
  { key: 'reels',  label: 'Reels',        purpose: 'Short-form examples, formats, hooks, and pacing to study.' },
  { key: 'weekly', label: 'Weekly',       purpose: 'Bigger patterns and accounts worth reviewing each week.' },
  { key: 'urgent', label: 'Urgent',       purpose: 'Time-sensitive stories and signals to act on soon.' },
]

const BRAND_BRAIN: Record<string, string> = {
  traceback: '00 Brand/00 Traceback',
  'personal-ai': '00 Brand/01 Personal',
  motivational: '00 Brand/02 Motivation',
}
const FORMAT_HUB: Record<string, string> = {
  'short-form': '02 Formats/00 Short Form',
  'long-form': '02 Formats/01 Long Form',
  x: '02 Formats/02 X',
  carousel: '02 Formats/03 Carousels',
  story: '02 Formats/04 Stories',
}
const STATUS_HUB: Record<string, string> = {
  research: '01 Research/00 research',
  script: '03 Board/00 Script/00 script',
  'ready-to-film': '03 Board/01 Ready to Film/00 ready-to-film',
  'film-today': '03 Board/02 Film Today/00 film-today',
  filmed: '03 Board/03 Filmed/00 filmed',
  'ready-to-post': '03 Board/04 Ready to Post/00 ready-to-post',
  posted: '03 Board/05 Posted/00 posted',
  archive: '04 Archive/00 archive',
}
const RESEARCH_HUB: Record<string, string> = {
  accounts: '01 Research/00 Accounts/00 accounts',
  daily: '01 Research/01 Daily Topics/00 daily-topics',
  reels: '01 Research/02 Reels/00 reels',
  weekly: '01 Research/03 Weekly/00 weekly',
  urgent: '01 Research/04 Urgent/00 urgent',
}
const CONTENT_OS_HUB = '00 Content OS'
const HUB_FILES = new Set([
  CONTENT_OS_HUB,
  ...Object.values(BRAND_BRAIN),
  ...Object.values(FORMAT_HUB),
  ...Object.values(STATUS_HUB),
  ...Object.values(RESEARCH_HUB),
  '01 Research/00 research',
  '03 Board/00 board',
  '99 Admin/00 admin',
])

// ── Frontmatter ──────────────────────────────────────────────────────────────

export function parseFM(text: string): { data: Record<string, string | null>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: text }
  const data: Record<string, string | null> = {}
  m[1].split('\n').forEach(line => {
    const ci = line.indexOf(':')
    if (ci < 0) return
    const k = line.slice(0, ci).trim()
    const v = line.slice(ci + 1).trim()
    data[k] = v === '' ? null : v.replace(/^["']|["']$/g, '')
  })
  return { data, body: m[2] }
}

export function writeFM(data: Record<string, unknown>, body: string): string {
  return '---\n' + Object.entries(data).map(([k, v]) => (v == null ? `${k}:` : `${k}: ${v}`)).join('\n') + '\n---\n' + body
}

// ── Detection ────────────────────────────────────────────────────────────────

function normStatus(raw: unknown): CardStatus | null {
  if (!raw) return null
  const s = String(raw).toLowerCase().trim()
  return ALIAS[s] || ((FLOW_MAP as Record<string, unknown>)[s] ? (s as CardStatus) : null)
}

function accountKey(raw: unknown): string | null {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return null
  if (s.includes('traceback')) return 'traceback'
  if (s.includes('personal-ai') || s.includes('personal ai')) return 'personal-ai'
  if (s.includes('motivation')) return 'motivational'
  return null
}

function detectAccount(p: string, d: Record<string, string | null>, body = ''): string | null {
  const known = accountKey(d.account) || accountKey(d.brand) || accountKey(d.account_for) || accountKey(d.accounts_for) || accountKey(d.for)
  if (known) return known
  const hay = `${p}\n${body}`
  if (/(?:^|\/)(?:\d{2}\s+)?Brand\/(?:\d{2}\s+)?Traceback(?:\.md|\/|$)/i.test(p)) return 'traceback'
  if (/(?:^|\/)(?:\d{2}\s+)?Brand\/(?:\d{2}\s+)?Personal(?:\.md|\/|$)/i.test(p)) return 'personal-ai'
  if (/(?:^|\/)(?:\d{2}\s+)?Brand\/(?:\d{2}\s+)?Motivation(?:\.md|\/|$)/i.test(p)) return 'motivational'
  if (/traceback/i.test(hay)) return 'traceback'
  if (/personal[-\s]?ai/i.test(hay)) return 'personal-ai'
  if (/motivational|motivation/i.test(hay)) return 'motivational'
  return null
}

function formatKey(raw: unknown): string | null {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return null
  if (s === 'short-form' || s === 'short form' || s === 'short') return 'short-form'
  if (s === 'long-form' || s === 'long form' || s === 'long') return 'long-form'
  if (s === 'x' || s === 'twitter') return 'x'
  if (s === 'carousel' || s === 'carousels') return 'carousel'
  if (s === 'story' || s === 'stories') return 'story'
  return null
}

function detectFormat(p: string, d: Record<string, string | null>, body = ''): string | null {
  const known = formatKey(d.format) || formatKey(d.account_format)
  if (known) return known
  const hay = `${p}\n${body}`
  if (/\/(?:\d{2}\s+)?Short Form(?:\.md|\/|$)/i.test(p)) return 'short-form'
  if (/\/(?:\d{2}\s+)?Long Form(?:\.md|\/|$)/i.test(p)) return 'long-form'
  if (/\/(?:\d{2}\s+)?X(?:\.md|\/|$)/i.test(p)) return 'x'
  if (/\/(?:\d{2}\s+)?Carousels?(?:\.md|\/|$)/i.test(p)) return 'carousel'
  if (/\/(?:\d{2}\s+)?Stories?(?:\.md|\/|$)/i.test(p)) return 'story'
  if (/short[-\s]?form|reel|shorts/i.test(hay)) return 'short-form'
  if (/long[-\s]?form/i.test(hay)) return 'long-form'
  return null
}

function detectStatus(p: string, d: Record<string, string | null>): CardStatus | null {
  const s = normStatus(d.status)
  if (s) return s
  if (/(?:^|\/)(?:\d{2}\s+)?Board\/(?:\d{2}\s+)?Script\//i.test(p)) return 'script'
  if (/(?:^|\/)(?:\d{2}\s+)?Board\/(?:\d{2}\s+)?Ready to Film\//i.test(p)) return 'ready-to-film'
  if (/(?:^|\/)(?:\d{2}\s+)?Board\/(?:\d{2}\s+)?Film Today\//i.test(p)) return 'film-today'
  if (/(?:^|\/)(?:\d{2}\s+)?Board\/(?:\d{2}\s+)?Filmed\//i.test(p)) return 'filmed'
  if (/(?:^|\/)(?:\d{2}\s+)?Board\/(?:\d{2}\s+)?Ready to Post\//i.test(p)) return 'ready-to-post'
  if (/(?:^|\/)(?:\d{2}\s+)?Board\/(?:\d{2}\s+)?Posted\//i.test(p)) return 'posted'
  if (/(?:^|\/)(?:\d{2}\s+)?Archive\//i.test(p)) return 'archive'
  if (/(?:^|\/)(?:\d{2}\s+)?Formats\//i.test(p)) return null
  if (/\/pipeline\//i.test(p)) return 'script'
  return 'research'
}

function researchType(p: string): ResearchBucket {
  if (/\/(?:\d{2}\s+)?Urgent\b|\/(?:\d{2}\s+)?Breaking\b/i.test(p)) return 'urgent'
  if (/\/(?:\d{2}\s+)?Reels\b|\/(?:\d{2}\s+)?Shorts\b|\/(?:\d{2}\s+)?Hooks\b/i.test(p)) return 'reels'
  if (/\/(?:\d{2}\s+)?Accounts\b/i.test(p)) return 'accounts'
  if (/\/(?:\d{2}\s+)?Weekly\b|\/(?:\d{2}\s+)?Trending\b/i.test(p)) return 'weekly'
  return 'daily'
}

const cleanHubPath = (p: string) => String(p || '').replace(/\.md$/i, '').replace(/\\/g, '/')
export const isHubFile = (f: { path: string }) => HUB_FILES.has(cleanHubPath(f.path))
export const isResearch = (f: { path: string }) => /(?:^|\/)(?:\d{2}\s+)?Research\//i.test(f.path)
const isBrand = (f: { path: string }) => /(?:^|\/)(?:\d{2}\s+)?Brand\//i.test(f.path)

export function isContent(f: Card): boolean {
  if (isHubFile(f)) return false
  if (isResearch(f) || isBrand(f)) return false
  if (['Playbook', 'Reference', 'Folder Hub', 'Brand', 'System Hub'].includes(String(f.data.node_type))) return false
  if (!f.account && !f.format && !f.status) return false
  return true
}

export function isResearchItem(f: Card): boolean {
  if (isHubFile(f)) return false
  return isResearch(f) || f.status === 'research'
}

function getTitle(name: string, body: string, data: Record<string, string | null>): string {
  if (data.summary) return data.summary
  const h1 = body && body.match(/^#+\s+(.+)$/m)
  if (h1) return h1[1].replace(/\*\*/g, '').trim()
  return name.replace(/^\(C\)\s*/, '').replace(/^[\d\s]+/, '').replace(/\.md$/, '').trim()
}

export function enrich(raw: RawFile): Card {
  const title = getTitle(raw.name, raw.body, raw.data)
  const hay = `${title}\n${raw.name}\n${raw.body}`
  const account = detectAccount(raw.path, raw.data, hay)
  const format = detectFormat(raw.path, raw.data, hay)
  const status = detectStatus(raw.path, raw.data)
  const rtype = isResearch({ path: raw.path }) ? researchType(raw.path) : null
  return { ...raw, account, format, status, title, rtype }
}

export function accountForList(f: Card): string[] {
  const raw = f.data.account_for || f.data.accounts_for || f.data.for || f.account || ''
  return String(raw).split(/[,\n]/).map(s => accountKey(s) || s.trim()).filter(Boolean) as string[]
}

// ── Labels ───────────────────────────────────────────────────────────────────

export const accountLabel = (key: string | null) => ACCOUNT_META.find(a => a.key === key)?.label || key || ''
export const formatLabel = (key: string | null) => FORMAT_META.find(f => f.key === key)?.label || key || ''
export const statusLabel = (key: string | null) => (key && FLOW_MAP[key]?.label) || key || ''
export const researchTypeLabel = (key: string) =>
  ({ accounts: 'Accounts', daily: 'Daily Topics', reels: 'Reels', weekly: 'Weekly', urgent: 'Urgent' } as Record<string, string>)[key] || key

// ── Paths + graph links (identical output to the old board) ─────────────────

export function toSlug(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().slice(0, 60)
}

export function buildFilePath(slug: string, status: CardStatus, bucket: ResearchBucket = 'daily'): string {
  if (status === 'research') {
    const bucketFolder = ({ accounts: '00 Accounts', daily: '01 Daily Topics', reels: '02 Reels', weekly: '03 Weekly', urgent: '04 Urgent' } as Record<string, string>)[bucket] || '01 Daily Topics'
    return `01 Research/${bucketFolder}/${slug}.md`
  }
  if (status === 'archive') return `04 Archive/(C) ${slug}.md`
  const boardFolder = ({
    script: '00 Script', 'ready-to-film': '01 Ready to Film', 'film-today': '02 Film Today',
    filmed: '03 Filmed', 'ready-to-post': '04 Ready to Post', posted: '05 Posted',
  } as Record<string, string>)[status]
  return `03 Board/${boardFolder || '00 Script'}/(C) ${slug}.md`
}

export const pathForCard = (f: Card, status: CardStatus) =>
  buildFilePath(toSlug(f.title || f.name.replace(/\.md$/, '')), status, f.rtype || 'daily')

const wiki = (target: string, label: string) => `[[${target}|${label}]]`
const brandBrainLink = (key: string) => wiki(BRAND_BRAIN[key] || accountLabel(key), accountLabel(key))

export function graphLinksFor(f: Pick<Card, 'account' | 'format' | 'status' | 'rtype'>): string[] {
  const links = [wiki(CONTENT_OS_HUB, 'Content OS')]
  if (f.account) links.push(brandBrainLink(f.account))
  if (f.format && FORMAT_HUB[f.format]) links.push(wiki(FORMAT_HUB[f.format], formatLabel(f.format)))
  if (f.status === 'research' && f.rtype && RESEARCH_HUB[f.rtype]) links.push(wiki(RESEARCH_HUB[f.rtype], researchTypeLabel(f.rtype)))
  else if (f.status && STATUS_HUB[f.status]) links.push(wiki(STATUS_HUB[f.status], statusLabel(f.status)))
  return [...new Set(links)]
}

function fillConnectedTo(body: string, f: Pick<Card, 'account' | 'format' | 'status' | 'rtype'>): string {
  const connected = graphLinksFor(f).map(link => `- ${link}`).join('\n')
  if (!connected) return body
  if (/## Connected To\n/.test(body)) {
    return body.replace(/## Connected To\n[\s\S]*?(?=\n## |\s*$)/, `## Connected To\n\n${connected}\n`)
  }
  return `${body.trimEnd()}\n\n## Connected To\n\n${connected}\n`
}

const stripGraphSection = (body: string) =>
  body.replace(/\n## Graph Links\n\n[\s\S]*?(?=\n## |\s*$)/, '').trimEnd()

export function withGraphLinks(body: string, f: Pick<Card, 'account' | 'format' | 'status' | 'rtype'>, extraLinks: string[] = []): string {
  const links = [...new Set([...extraLinks, ...graphLinksFor(f)])]
  const connectedBody = fillConnectedTo(body, f)
  if (!links.length) return connectedBody
  return `${stripGraphSection(connectedBody)}\n\n## Graph Links\n\n${links.join('\n')}\n`
}

// ── New-card templates (same bodies the old board wrote) ─────────────────────

export function buildTemplate(opts: {
  title: string
  account: string | null
  format: string | null
  status: CardStatus
  bucket?: ResearchBucket
  link?: string
  context?: string
}): string {
  const { title, account, format, status, bucket = 'daily', link = '', context = '' } = opts
  const fm: Record<string, unknown> = {
    node_type: 'Note', summary: title,
    ...(account && { account }), ...(format && { format }),
    status, film_date: null, post_date: null, source: link || null, proof: null,
  }
  let body: string
  if (status === 'research') {
    body = `# ${title}\n\n## Link\n\n${link}\n\n## Body\n\n${context}\n\n## Account\n\n${accountLabel(account)}\n\n## Format\n\n${formatLabel(format)}\n\n## Connected To\n`
  } else if (format === 'short-form' || format === 'long-form') {
    body = `# ${title}\n\n## Info\n\n- Published:\n- Performance:\n- Link: ${link}\n- Source angle:\n\n## North Star\n\n${context}\n\n## Hooks\n\n- **Text overlay (0:00):**\n- **Overlay 2 (last line):**\n\n## Script\n\n\n\n## Shot Notes\n\n\n\n## Connected To\n`
  } else if (format === 'x') {
    body = `# ${title}\n\n## Thread\n\n1. \n\n## Hook\n\n\n\n## Connected To\n`
  } else if (format === 'carousel') {
    body = `# ${title}\n\n## Slides\n\n1. **Cover:**\n2.\n3.\n\n## Caption\n\n\n\n## Connected To\n`
  } else if (format === 'story') {
    body = `# ${title}\n\n## Story Sequence\n\n1.\n2.\n3.\n\n## CTA\n\n\n\n## Connected To\n`
  } else {
    body = `# ${title}\n\n## Idea\n\n\n\n## Why This Works\n\n\n\n## Source\n\n\n\n## Connected To\n`
  }
  const fake = { account, format, status, rtype: status === 'research' ? bucket : null }
  return writeFM(fm, withGraphLinks(body, fake))
}

// ── API (through the Next.js proxy) ──────────────────────────────────────────

export async function apiScan(): Promise<RawFile[] | { needsVault: true } | { error: string }> {
  const r = await fetch('/api/board/scan?t=' + Date.now(), { cache: 'no-store' })
  if (!r.ok) return { error: `Scan failed (${r.status})` }
  return r.json()
}

export async function apiWrite(filePath: string, content: string): Promise<void> {
  const r = await fetch('/api/board/write', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Write failed')
}

export async function apiCreate(filePath: string, content: string): Promise<void> {
  const r = await fetch('/api/board/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Create failed')
}

export async function apiDelete(filePath: string): Promise<void> {
  const r = await fetch('/api/board/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Delete failed')
}

// ── Editor helpers ───────────────────────────────────────────────────────────

export function safeMarkdownFileName(value: string): string {
  const stem = String(value || '').trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
  return stem ? `${stem}.md` : ''
}

export function parentDir(p: string): string {
  const parts = String(p || '').split('/')
  parts.pop()
  return parts.join('/')
}

/** One editable section of a note body. `heading` is null for the preamble. */
export interface BodyBlock {
  heading: string | null
  content: string
}

/**
 * Split a body into its H1 title, a preamble, and one block per `## Heading`,
 * so each section edits as its own block. parse → serialize round-trips.
 */
export function parseBlocks(body: string): { title: string | null; blocks: BodyBlock[] } {
  let rest = body
  let title: string | null = null
  const h1 = rest.match(/^\s*#\s+(.+)\r?\n?/)
  if (h1) {
    title = h1[1].trim()
    rest = rest.slice(h1[0].length)
  }
  const blocks: BodyBlock[] = []
  const parts = rest.split(/^## +/m)
  const preamble = parts.shift() ?? ''
  if (preamble.trim()) blocks.push({ heading: null, content: preamble.trim() })
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim()
    const content = nl < 0 ? '' : part.slice(nl + 1).trim()
    blocks.push({ heading, content })
  }
  return { title, blocks }
}

export function serializeBlocks(title: string | null, blocks: BodyBlock[]): string {
  const out: string[] = []
  if (title) out.push(`# ${title}`)
  for (const b of blocks) {
    if (b.heading == null) { if (b.content.trim()) out.push(b.content.trim()) }
    else out.push(`## ${b.heading}\n\n${b.content.trim()}`)
  }
  return out.join('\n\n') + '\n'
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export const CAL_FIELDS = [
  { field: 'film_date', timeField: 'film_time', label: 'Film', color: 'var(--ok)' },
  { field: 'post_date', timeField: 'post_time', label: 'Post', color: 'var(--accent)' },
] as const

export const ymd = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

export function openInObsidian(path: string) {
  const fp = `01 Content OS/${path}`
  window.location.href = `obsidian://open?vault=${encodeURIComponent('Obsidian Vault')}&file=${encodeURIComponent(fp)}`
}
