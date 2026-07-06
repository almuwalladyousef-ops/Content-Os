'use strict';

const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Load .env (works both standalone and when required by main.js)
const _envPath = path.join(__dirname, '.env');
if (fs.existsSync(_envPath)) {
  fs.readFileSync(_envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.trim().split('=');
    if (key && !key.startsWith('#') && rest.length) {
      if (!process.env[key.trim()]) process.env[key.trim()] = rest.join('=').trim();
    }
  });
}

const os = require('os');

const PORT = Number(process.env.PORT) || Number(process.env.GC_PORT) || 3737;
const TOKEN_PATH = process.env.GC_TOKEN_PATH || path.join(__dirname, '.gc_token.json');
const DATA_DIR = (process.env.DATA_DIR || path.join(os.homedir(), 'ContentOS-data')).replace(/^~(?=\/)/, os.homedir());
const HOME_SERVER_SECRET = process.env.HOME_SERVER_SECRET || '';

// Credentials — set via environment or .env loaded by main.js
const CLIENT_ID = process.env.GC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GC_CLIENT_SECRET || '';
const API_KEY = process.env.GC_API_KEY || '';
const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/fonts', express.static(path.join(__dirname, 'board', 'fonts')));

// Allow Content OS (file:// or another localhost port) to call this backend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Lightweight request log (confirms the app window is loading)
app.use((req, res, next) => { console.log(`[req] ${req.method} ${req.url}`); next(); });

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'contentos-home-server', now: new Date().toISOString() }));

// ── Storage API (large files for the Vercel app; replaces Vercel Blob) ──────
require('./storage')(app, { dataDir: DATA_DIR, secret: HOME_SERVER_SECRET });

// ── LinkScribe job runner (download + local Whisper) ────────────────────────
require('./linkscribe-worker')(app, { dataDir: DATA_DIR, secret: HOME_SERVER_SECRET });

// ── Readback engine at /readback-api/* (ESM engine, dynamic-imported into CJS) ─
process.env.READBACK_DATA_DIR = process.env.READBACK_DATA_DIR || path.join(DATA_DIR, 'readback');
import('./readback/index.mjs')
  .then(({ mountReadback }) => mountReadback(app))
  .catch(err => console.error('[readback] mount failed:', err));

// ── Content OS frontend + vault (markdown files) ─────────────────────────────

const CONTENT_OS_HTML = process.env.CONTENT_OS_HTML || path.join(__dirname, 'board', 'content-os.html');
const VAULT_CONFIG = process.env.VAULT_CONFIG || path.join(__dirname, 'vault.json');

function getVault() {
  try {
    const j = JSON.parse(fs.readFileSync(VAULT_CONFIG, 'utf8'));
    if (j && j.path && fs.existsSync(j.path)) return j.path;
  } catch {}
  return null;
}
function setVault(p) {
  fs.writeFileSync(VAULT_CONFIG, JSON.stringify({ path: p }, null, 2), 'utf8');
}

// Frontmatter parser — mirrors content-os.html's parseFM so /api/scan returns the same shape
function parseFM(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  m[1].split('\n').forEach(line => {
    const ci = line.indexOf(':');
    if (ci < 0) return;
    const k = line.slice(0, ci).trim();
    const v = line.slice(ci + 1).trim();
    data[k] = v === '' ? null : v.replace(/^["']|["']$/g, '');
  });
  return { data, body: m[2] };
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash']);
function scanVault(dir, rel, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const full = rel ? `${rel}/${name}` : name;
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.isDirectory()) scanVault(abs, full, out);
    else if (name.endsWith('.md')) {
      try {
        const content = fs.readFileSync(abs, 'utf8');
        const { data, body } = parseFM(content);
        out.push({ name, path: full, data, body, content });
      } catch {}
    }
  }
}

// Keep file operations inside the vault (no path traversal)
function vaultResolve(vault, filePath) {
  const abs = path.resolve(vault, filePath || '');
  if (abs !== vault && !abs.startsWith(vault + path.sep)) return null;
  return abs;
}

// Serve the Content OS app at /
app.get('/', (req, res) => {
  if (fs.existsSync(CONTENT_OS_HTML)) return res.sendFile(CONTENT_OS_HTML);
  res.status(404).type('text').send('content-os.html not found at ' + CONTENT_OS_HTML);
});

// Open a URL in the user's real browser. The app runs in a WKWebView, which
// can't open new windows (window.open is a no-op), so the launcher's external
// "Poster" view calls this to pop the live site in Chrome — where OAuth login
// and posting actually work (providers refuse to load inside a webview/iframe).
app.get('/open', (req, res) => {
  const url = String(req.query.url || '');
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'invalid url' });
  const { execFile } = require('child_process');
  // Prefer Chrome; fall back to the default browser if Chrome isn't installed.
  execFile('open', ['-a', 'Google Chrome', url], (err) => {
    if (err) execFile('open', [url], () => {});
  });
  res.json({ ok: true });
});

// Desktop OAuth bridge: the Poster's settings page (in the app's webview)
// navigates here to start a connect. We open the OAuth URL in Chrome — where
// providers allow login — and bounce the webview straight back to the Poster
// settings page, which polls the hand-off endpoint until Chrome finishes.
app.get('/connect', (req, res) => {
  const url = String(req.query.url || '');
  const back = String(req.query.back || '');
  if (!/^https:\/\//i.test(url) || !/^https:\/\//i.test(back)) {
    return res.status(400).send('invalid url');
  }
  const { execFile } = require('child_process');
  execFile('open', ['-a', 'Google Chrome', url], (err) => {
    if (err) execFile('open', [url], () => {});
  });
  res.redirect(back);
});

// Current vault path
app.get('/api/vault', (req, res) => res.json({ path: getVault() }));

// Native macOS folder picker (first run + the hidden "change folder" button)
app.post('/api/vault/choose', (req, res) => {
  const { execFile } = require('child_process');
  const script =
    'try\n' +
    '  set f to choose folder with prompt "Choose your Content OS folder"\n' +
    '  POSIX path of f\n' +
    'end try';
  execFile('osascript', ['-e', script], (err, stdout) => {
    const p = (stdout || '').trim().replace(/\/+$/, '');
    if (err || !p) return res.json({ ok: false, cancelled: true });
    setVault(p);
    res.json({ ok: true, path: p });
  });
});

// Scan the vault for markdown cards
app.get('/api/scan', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const vault = getVault();
  if (!vault) return res.json({ needsVault: true });
  const out = [];
  try { scanVault(vault, '', out); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  res.json(out);
});

function writeInVault(req, res) {
  const vault = getVault();
  if (!vault) return res.status(400).json({ ok: false, error: 'No folder selected' });
  const abs = vaultResolve(vault, req.body.filePath);
  if (!abs) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, req.body.content ?? '', 'utf8');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
}
app.put('/api/write', writeInVault);
app.post('/api/create', writeInVault);

app.delete('/api/delete', (req, res) => {
  const vault = getVault();
  if (!vault) return res.status(400).json({ ok: false, error: 'No folder selected' });
  const abs = vaultResolve(vault, req.body.filePath);
  if (!abs) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try { fs.unlinkSync(abs); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── OAuth2 helpers ──────────────────────────────────────────────────────────

function makeOAuth2() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    }
  } catch {}
  return null;
}

function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token), 'utf8');
}

function clearToken() {
  try { fs.unlinkSync(TOKEN_PATH); } catch {}
}

function getAuthedClient() {
  const token = loadToken();
  if (!token) return null;
  const auth = makeOAuth2();
  auth.setCredentials(token);
  // Persist refreshed tokens automatically
  auth.on('tokens', (fresh) => {
    saveToken({ ...loadToken(), ...fresh });
  });
  return auth;
}

function calendarClient() {
  const auth = getAuthedClient();
  if (!auth) return null;
  return google.calendar({ version: 'v3', auth });
}

// ── Auth routes ─────────────────────────────────────────────────────────────

// Start OAuth flow — open this in a popup from the renderer
app.get('/auth', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(
      'GC_CLIENT_ID and GC_CLIENT_SECRET are not set. ' +
      'Copy .env.example to .env and fill in your credentials.'
    );
  }
  const url = makeOAuth2().generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts.other.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    prompt: 'consent',
  });
  res.redirect(url);
});

// Google redirects here after the user grants access
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;

  const closeWithMsg = (type, extra = {}) => {
    const payload = JSON.stringify({ type, ...extra });
    res.send(
      `<script>
        if(window.opener) window.opener.postMessage(${payload},'*');
        window.close();
      </script>`
    );
  };

  if (error) return closeWithMsg('gc_auth_error', { error });

  try {
    const { tokens } = await makeOAuth2().getToken(code);
    saveToken(tokens);
    closeWithMsg('gc_auth_success');
  } catch (err) {
    closeWithMsg('gc_auth_error', { error: err.message });
  }
});

// Check whether we already have a stored token
app.get('/auth/status', (req, res) => {
  res.json({ authed: !!loadToken() });
});

// Sign out — delete stored token
app.post('/auth/signout', (req, res) => {
  const token = loadToken();
  if (token?.access_token) {
    makeOAuth2().revokeToken(token.access_token).catch(() => {});
  }
  clearToken();
  res.json({ ok: true });
});

// ── Calendar API proxy ───────────────────────────────────────────────────────

app.get('/api/events', async (req, res) => {
  const cal = calendarClient();
  if (!cal) return res.status(401).json({ error: 'Not authenticated' });

  const { timeMin, timeMax, calendarId = 'primary' } = req.query;
  try {
    const r = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    });
    res.json(r.data);
  } catch (err) {
    console.error('[gcapi] list events:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch a single event (used to detect deletions in Google → clear them in the app)
app.get('/api/events/:id', async (req, res) => {
  const cal = calendarClient();
  if (!cal) return res.status(401).json({ error: 'Not authenticated' });

  const { calendarId = 'primary' } = req.query;
  try {
    const r = await cal.events.get({ calendarId, eventId: req.params.id });
    res.json(r.data);
  } catch (err) {
    res.status(err.code || 500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  const cal = calendarClient();
  if (!cal) return res.status(401).json({ error: 'Not authenticated' });

  const { calendarId = 'primary', ...body } = req.body;
  try {
    const r = await cal.events.insert({
      calendarId,
      requestBody: body,
      conferenceDataVersion: 1,
    });
    res.json(r.data);
  } catch (err) {
    console.error('[gcapi] create event:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  const cal = calendarClient();
  if (!cal) return res.status(401).json({ error: 'Not authenticated' });

  const { calendarId = 'primary', ...body } = req.body;
  try {
    const r = await cal.events.patch({
      calendarId,
      eventId: req.params.id,
      requestBody: body,
      conferenceDataVersion: 1,
    });
    res.json(r.data);
  } catch (err) {
    console.error('[gcapi] patch event:', err.message);
    // Forward Google's status (e.g. 404/410 when the event was deleted) so the client can recreate it
    res.status(err.code || 500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const cal = calendarClient();
  if (!cal) return res.status(401).json({ error: 'Not authenticated' });

  const { calendarId = 'primary' } = req.query;
  try {
    await cal.events.delete({ calendarId, eventId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[gcapi] delete event:', err.message);
    // 410 = already deleted; treat as success so re-deletes don't error
    if (err.code === 410 || err.code === 404) return res.json({ ok: true, alreadyGone: true });
    res.status(err.code || 500).json({ error: err.message });
  }
});

// ── Return access token for client-side Google Picker ────────────────────────

app.get('/auth/token', (req, res) => {
  const token = loadToken();
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ access_token: token.access_token });
});

// ── Return public config (API key for Google Picker + Places) ────────────────

app.get('/auth/config', (req, res) => {
  res.json({ apiKey: API_KEY, placesKey: PLACES_API_KEY });
});

// ── Places autocomplete proxy (keeps API key server-side) ────────────────────

app.get('/api/places', async (req, res) => {
  const { q = '' } = req.query;
  if (!q.trim() || !PLACES_API_KEY) return res.json({ predictions: [] });
  try {
    // Use Places API (New) autocomplete endpoint
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_API_KEY,
        'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.placeId',
      },
      body: JSON.stringify({ input: q, languageCode: 'en' }),
    });
    const data = await r.json();
    const predictions = (data.suggestions || []).map(s => ({
      description: s.placePrediction?.text?.text || '',
      place_id: s.placePrediction?.placeId || '',
    })).filter(p => p.description);
    res.json({ predictions });
  } catch (err) {
    console.error('[places]', err.message);
    res.json({ predictions: [] });
  }
});

// ── Drive file search ─────────────────────────────────────────────────────────

app.get('/api/drive/files', async (req, res) => {
  const auth = getAuthedClient();
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  const { q = '', tab = 'recent', folderId = '' } = req.query;

  let qStr = 'trashed = false';
  if (tab === 'shared') qStr = 'sharedWithMe = true and trashed = false';
  else if (tab === 'starred') qStr = 'starred = true and trashed = false';
  else if (tab === 'my-drive') {
    const parent = folderId || 'root';
    qStr = `'${parent}' in parents and trashed = false`;
  }
  if (q.trim()) qStr += ` and name contains '${q.replace(/'/g, "\\'")}'`;

  try {
    const drive = google.drive({ version: 'v3', auth });
    const r = await drive.files.list({
      q: qStr,
      pageSize: 100,
      fields: 'files(id,name,mimeType,modifiedTime,thumbnailLink,iconLink,webViewLink,size,parents)',
      orderBy: tab === 'my-drive' ? 'folder,name' : 'modifiedTime desc',
    });
    // If browsing a folder, also fetch the folder's name for breadcrumb
    let folderName = null;
    if (folderId && tab === 'my-drive') {
      try {
        const fm = await drive.files.get({ fileId: folderId, fields: 'id,name,parents' });
        folderName = fm.data.name;
      } catch {}
    }
    res.json({ files: r.data.files || [], folderName });
  } catch (err) {
    console.error('[drive]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Contacts search via People API ───────────────────────────────────────────

app.get('/api/contacts', async (req, res) => {
  const auth = getAuthedClient();
  if (!auth) return res.json({ contacts: [] });
  const { q = '' } = req.query;
  if (!q.trim()) return res.json({ contacts: [] });
  try {
    const people = google.people({ version: 'v1', auth });

    // Search saved contacts and Gmail "other contacts" in parallel
    const [savedRes, otherRes] = await Promise.allSettled([
      people.people.searchContacts({
        query: q,
        readMask: 'names,emailAddresses',
        pageSize: 8,
        sources: ['READ_SOURCE_TYPE_CONTACT'],
      }),
      people.otherContacts.search({
        query: q,
        readMask: 'names,emailAddresses',
        pageSize: 8,
      }),
    ]);

    if (savedRes.status === 'rejected')
      console.error('[contacts] searchContacts failed:', savedRes.reason?.message);
    if (otherRes.status === 'rejected')
      console.error('[contacts] otherContacts.search failed:', otherRes.reason?.message);

    const extract = (results = []) => results.flatMap(result => {
      const p = result.person;
      const name = p.names?.[0]?.displayName || '';
      return (p.emailAddresses || []).map(e => ({ name, email: e.value }));
    }).filter(c => c.email);

    const saved = savedRes.status === 'fulfilled'
      ? extract(savedRes.value.data.results || []) : [];
    const other = otherRes.status === 'fulfilled'
      ? extract(otherRes.value.data.results || []) : [];

    console.log(`[contacts] q="${q}" saved=${saved.length} other=${other.length}`);

    // Merge, deduplicate by email, saved contacts take priority
    const seen = new Set();
    const contacts = [...saved, ...other].filter(c => {
      if (seen.has(c.email)) return false;
      seen.add(c.email);
      return true;
    }).slice(0, 8);

    res.json({ contacts });
  } catch (err) {
    console.error('[contacts] outer error:', err.message);
    res.json({ contacts: [] });
  }
});

// ── List all user calendars (for future multi-calendar support) ──────────────

app.get('/api/calendars', async (req, res) => {
  const cal = calendarClient();
  if (!cal) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const r = await cal.calendarList.list();
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scheduled posts: heartbeat + board sync ──────────────────────────────────
//
// The Poster (Vercel) holds the queue of scheduled posts but has no clock of its
// own and can't reach this machine's vault. So this always-on local server is
// the heartbeat: once a minute it pings the Poster's worker, which fires any due
// posts and returns the current queue. We then mirror that queue into the vault
// board — scheduled posts appear under "Scheduled" (04 Ready to Post) and move
// to "Posted" (05 Posted) once they've gone out. Entirely best-effort.

const POSTER_URL = (process.env.POSTER_URL || 'https://contentos-flame.vercel.app').replace(/\/+$/, '');
const CRON_SECRET = process.env.CRON_SECRET || '';
const SCHED_DIR = '03 Board/04 Ready to Post';
const POSTED_DIR = '03 Board/05 Posted';

function schedTitle(job) {
  const firstLine = (s) => String(s || '').split('\n').map(x => x.trim()).find(Boolean) || '';
  const t = firstLine(job.caption) || firstLine(job.ytCaption) || String(job.fileName || '').replace(/\.[^.]+$/, '') || 'Scheduled post';
  return t.length > 80 ? t.slice(0, 77) + '…' : t;
}

function schedCardMarkdown(job, status) {
  const when = new Date(job.scheduledAt);
  const pad = (n) => String(n).padStart(2, '0');
  const postDate = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const postTime = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const title = schedTitle(job);
  const platforms = Object.entries(job.platforms || {}).filter(([, v]) => v).map(([k]) => k).join(', ');
  const results = job.results || {};
  const proof = [results.youtube?.url, results.instagram?.url].filter(Boolean).join(' ');
  const fm = {
    node_type: 'Note',
    summary: title,
    format: job.videoType === 'long' ? 'long-form' : 'short-form',
    status,
    film_date: null,
    post_date: postDate,
    post_time: postTime,
    source: null,
    proof: proof || null,
    scheduled: 'true',
    sched_id: job.id,
    sched_platforms: platforms,
    sched_status: job.status,
  };
  const errLine = job.status === 'failed' && job.error ? `\n## Schedule error\n\n${job.error}\n` : '';
  const body = `# ${title}\n\n## Caption\n\n${job.caption || ''}\n\n## Auto-post\n\n- Platforms: ${platforms}\n- Time: ${postDate} ${postTime}\n- File: ${job.fileName || ''}\n${errLine}\n## Connected To\n`;
  const fmText = '---\n' + Object.entries(fm).map(([k, v]) => v == null ? `${k}:` : `${k}: ${v}`).join('\n') + '\n---\n';
  return fmText + body;
}

function syncScheduleCards(jobs) {
  const vault = getVault();
  if (!vault) return;
  for (const job of jobs) {
    if (!job || !job.id) continue;
    const fileName = `(C) sched-${job.id}.md`;
    const schedPath = path.join(vault, SCHED_DIR, fileName);
    const postedPath = path.join(vault, POSTED_DIR, fileName);
    try {
      if (job.status === 'done') {
        // Move to Posted: write there, remove the scheduled copy if present.
        fs.mkdirSync(path.dirname(postedPath), { recursive: true });
        fs.writeFileSync(postedPath, schedCardMarkdown(job, 'posted'), 'utf8');
        if (fs.existsSync(schedPath)) { try { fs.unlinkSync(schedPath); } catch {} }
      } else if (job.status === 'pending' || job.status === 'posting' || job.status === 'failed') {
        // Keep in Scheduled (don't clobber a card the user may have moved to Posted already).
        if (fs.existsSync(postedPath)) continue;
        fs.mkdirSync(path.dirname(schedPath), { recursive: true });
        fs.writeFileSync(schedPath, schedCardMarkdown(job, 'ready-to-post'), 'utf8');
      }
    } catch (e) {
      console.log('[schedule] card sync error:', e.message);
    }
  }
}

async function scheduleHeartbeat() {
  try {
    const res = await fetch(`${POSTER_URL}/api/cron/post`, {
      method: 'GET',
      headers: CRON_SECRET ? { authorization: `Bearer ${CRON_SECRET}` } : {},
    });
    if (!res.ok) { console.log('[schedule] worker responded', res.status); return; }
    const data = await res.json();
    if (data && Array.isArray(data.jobs)) {
      if (data.due) console.log(`[schedule] worker fired ${data.due} due post(s)`);
      syncScheduleCards(data.jobs);
    }
  } catch (e) {
    console.log('[schedule] heartbeat error:', e.message);
  }
}

setTimeout(scheduleHeartbeat, 8000);          // shortly after launch
setInterval(scheduleHeartbeat, 60 * 1000);    // then every minute while the app runs
console.log(`[schedule] heartbeat enabled → ${POSTER_URL}${CRON_SECRET ? ' (secured)' : ''}`);

// Daily tick: refresh long-lived Instagram tokens in the DM engine
// (replaces triggerdm's monthly vercel.json cron — this machine is the only clock).
async function dmRefreshTick() {
  try {
    const res = await fetch(`${POSTER_URL}/api/dm/refresh-token`, {
      method: 'POST',
      headers: CRON_SECRET ? { authorization: `Bearer ${CRON_SECRET}` } : {},
    });
    console.log('[dm] token refresh tick →', res.status);
  } catch (e) {
    console.log('[dm] token refresh error:', e.message);
  }
}
setTimeout(dmRefreshTick, 30 * 1000);
setInterval(dmRefreshTick, 24 * 60 * 60 * 1000);

// ── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] Calendar backend → http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another instance (or dev server) is already running on this port — reuse it
    console.log(`[server] Port ${PORT} already in use, reusing existing server`);
  } else {
    throw err;
  }
});

module.exports = { PORT };
