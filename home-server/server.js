'use strict';

const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env (works both standalone and when required by main.js)
// A repointed desktop launch agent can keep using the packaged app's existing
// credentials without copying secrets into the repo. Standalone installs still
// default to home-server/.env.
const _envPath = process.env.CONTENT_OS_ENV || path.join(__dirname, '.env');
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
  .then(({ mountReadback }) => mountReadback(app, { secret: HOME_SERVER_SECRET }))
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

// ── Bulk import: native multi-select picker (files or folders) → vault ──────
// Keep this in the unified server so repointing the launch agent from the
// packaged desktop server does not remove the board's Import action.
const IMPORT_EXT = /\.(md|markdown|txt)$/i;

function collectImportFiles(p, out) {
  const name = path.basename(p);
  if (name.startsWith('.') || SKIP_DIRS.has(name)) return;
  let st;
  try { st = fs.statSync(p); } catch { return; }
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(p)) collectImportFiles(path.join(p, n), out);
  } else if (IMPORT_EXT.test(name)) {
    out.push(p);
  } else {
    out.skipped++;
  }
}

// Graph-link maps mirror the installed board so imported files get the same
// Connected To / Graph Links sections as files created in the app.
const HUB_LINK = '[[00 Content OS|Content OS]]';
const BRAND_HUB = { traceback: '01 Brand/01 Traceback', 'personal-ai': '01 Brand/02 Personal', motivational: '01 Brand/03 Motivation' };
const BRAND_LABEL = { traceback: 'Traceback', 'personal-ai': 'Personal AI', motivational: 'Motivational' };
const FORMAT_HUB = { 'short-form': '03 Formats/01 Short Form', 'long-form': '03 Formats/02 Long Form', x: '03 Formats/03 X', carousel: '03 Formats/04 Carousels', story: '03 Formats/05 Stories' };
const FORMAT_LABEL = { 'short-form': 'Short Form', 'long-form': 'Long Form', x: 'X', carousel: 'Carousels', story: 'Stories' };
const RESEARCH_HUB = { accounts: '02 Research/00 Accounts/00 accounts', videos: '02 Research/01 Inbox/00 inbox', topics: '02 Research/03 Topics/00 topics', urgent: '02 Research/04 Urgent/00 urgent' };
const RESEARCH_LABEL = { accounts: 'Accounts', videos: 'Videos', topics: 'Topics', urgent: 'Urgent' };
const STATUS_HUB = { script: '04 Board/01 Scripts/00 scripts', 'ready-to-film': '04 Board/02 Ready to Film/00 ready-to-film', 'film-today': '04 Board/03 Film Today/00 film-today', filmed: '04 Board/04 Filmed/00 filmed', 'ready-to-post': '04 Board/05 Ready to Post/00 ready-to-post', posted: '04 Board/06 Posted/00 posted', archive: '05 Archive/00 archive' };
const STATUS_LABEL = { script: 'Script', 'ready-to-film': 'Ready to Film', 'film-today': 'Film Today', filmed: 'Filmed', 'ready-to-post': 'Ready to Post', posted: 'Posted', archive: 'Archive' };

function graphLinksForImport(status, bucket, fmData) {
  const links = [HUB_LINK];
  const acc = String(fmData.account || '').toLowerCase().trim();
  if (BRAND_HUB[acc]) links.push(`[[${BRAND_HUB[acc]}|${BRAND_LABEL[acc]}]]`);
  const fmt = String(fmData.format || '').toLowerCase().trim();
  if (FORMAT_HUB[fmt]) links.push(`[[${FORMAT_HUB[fmt]}|${FORMAT_LABEL[fmt]}]]`);
  if (status === 'research' && RESEARCH_HUB[bucket]) links.push(`[[${RESEARCH_HUB[bucket]}|${RESEARCH_LABEL[bucket]}]]`);
  else if (STATUS_HUB[status]) links.push(`[[${STATUS_HUB[status]}|${STATUS_LABEL[status]}]]`);
  return [...new Set(links)];
}

function withLinkSections(body, links) {
  const connected = links.map(l => '- ' + l).join('\n');
  let b = body;
  if (/## Connected To\n/.test(b)) b = b.replace(/## Connected To\n[\s\S]*?(?=\n## |\s*$)/, `## Connected To\n\n${connected}\n`);
  else b = b.trimEnd() + `\n\n## Connected To\n\n${connected}\n`;
  b = b.replace(/\n## Graph Links\n\n[\s\S]*?(?=\n## |\s*$)/, '').replace(/\s+$/, '');
  return `${b}\n\n## Graph Links\n\n${links.join('\n')}\n`;
}

function importedContent(text, status, title, bucket) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let fm, body;
  if (m) {
    fm = m[1];
    fm = /^status\s*:/mi.test(fm) ? fm.replace(/^status\s*:.*$/mi, 'status: ' + status) : fm + '\nstatus: ' + status;
    if (!/^summary\s*:/mi.test(fm)) fm += '\nsummary: ' + title;
    if (!/^node_type\s*:/mi.test(fm)) fm = 'node_type: Note\n' + fm;
    body = m[2];
  } else {
    fm = `node_type: Note\nsummary: ${title}\nstatus: ${status}`;
    body = '\n' + text.trim() + '\n';
  }
  const links = graphLinksForImport(status, bucket, parseFM(`---\n${fm}\n---\n`).data);
  return `---\n${fm}\n---\n${withLinkSections(body, links)}`;
}

app.post('/api/import', (req, res) => {
  const vault = getVault();
  if (!vault) return res.status(400).json({ ok: false, error: 'No folder selected' });
  const destAbs = vaultResolve(vault, String(req.body.destDir || ''));
  if (!destAbs) return res.status(400).json({ ok: false, error: 'Invalid destination' });
  const status = String(req.body.status || 'research');
  const bucket = String(req.body.bucket || 'topics');
  const mode = req.body.mode === 'folders' ? 'folders' : 'files';
  const pick = mode === 'folders'
    ? '  set fs to choose folder with prompt "Import folders into Content OS" with multiple selections allowed\n'
    : '  set fs to choose file with prompt "Import files into Content OS" with multiple selections allowed\n';
  const script =
    'try\n' + pick +
    '  set out to ""\n' +
    '  repeat with f in fs\n' +
    '    set out to out & POSIX path of f & linefeed\n' +
    '  end repeat\n' +
    '  out\n' +
    'end try';
  const { execFile } = require('child_process');
  execFile('osascript', ['-e', script], (err, stdout) => {
    const picks = (stdout || '').split('\n').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    if (err || !picks.length) return res.json({ ok: true, cancelled: true, imported: 0, skipped: 0 });
    const sources = [];
    sources.skipped = 0;
    picks.forEach(p => collectImportFiles(p, sources));
    let imported = 0, skipped = sources.skipped;
    try { fs.mkdirSync(destAbs, { recursive: true }); } catch {}
    for (const src of sources) {
      try {
        const text = fs.readFileSync(src, 'utf8');
        const stem = (path.basename(src).replace(IMPORT_EXT, '')
          .replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()) || 'imported';
        let target = path.join(destAbs, stem + '.md');
        let n = 2;
        while (fs.existsSync(target)) target = path.join(destAbs, `${stem} ${n++}.md`);
        fs.writeFileSync(target, importedContent(text, status, stem, bucket), 'utf8');
        imported++;
      } catch { skipped++; }
    }
    res.json({ ok: true, imported, skipped });
  });
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

// ── Scheduled posts: local timer + board sync ──────────────────────────────
//
// The Poster (Vercel) holds the queue of scheduled posts but has no clock of its
// own and can't reach this machine's vault. When a post is scheduled, Vercel
// sends its due time here once. This server holds the timer locally and calls
// the worker only when needed. Startup and daily recovery calls rebuild the
// timer after outages. Returned jobs are mirrored into the vault board.

const POSTER_URL = (process.env.POSTER_URL || 'https://contentos-flame.vercel.app').replace(/\/+$/, '');
const CRON_SECRET = process.env.CRON_SECRET || '';
const SCHED_DIR = '04 Board/05 Ready to Post';
const POSTED_DIR = '04 Board/06 Posted';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;

let scheduleTimer = null;
let scheduledWakeAt = null;
let scheduleWorkerRunning = false;

function homeServerAuthed(req) {
  if (!HOME_SERVER_SECRET) return true;
  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const candidate = bearer || String(req.query.secret || '');
  if (!candidate || candidate.length !== HOME_SERVER_SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(HOME_SERVER_SECRET));
}

function armScheduleTimer(value) {
  const dueAt = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(dueAt)) return false;

  // An existing earlier wake already covers this job.
  if (scheduleTimer && scheduledWakeAt != null && scheduledWakeAt <= dueAt) return true;
  if (scheduleTimer) clearTimeout(scheduleTimer);

  scheduledWakeAt = dueAt;
  const remaining = Math.max(1000, dueAt - Date.now());
  const delay = Math.min(remaining, DAY_MS);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    if (scheduledWakeAt != null && Date.now() + 500 < scheduledWakeAt) {
      armScheduleTimer(scheduledWakeAt);
      return;
    }
    scheduledWakeAt = null;
    scheduleWorkerTick();
  }, delay);
  scheduleTimer.unref?.();
  console.log(`[schedule] local wake armed for ${new Date(dueAt).toISOString()}`);
  return true;
}

function armNextPending(jobs) {
  const next = (jobs || [])
    .filter(job => job && job.status === 'pending')
    .map(job => new Date(job.scheduledAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  if (next != null) armScheduleTimer(next);
}

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

async function scheduleWorkerTick() {
  if (scheduleWorkerRunning) return;
  scheduleWorkerRunning = true;
  try {
    const res = await fetch(`${POSTER_URL}/api/cron/post`, {
      method: 'GET',
      headers: CRON_SECRET ? { authorization: `Bearer ${CRON_SECRET}` } : {},
    });
    if (!res.ok) {
      console.log('[schedule] worker responded', res.status);
      armScheduleTimer(Date.now() + RETRY_MS);
      return;
    }
    const data = await res.json();
    if (data && Array.isArray(data.jobs)) {
      if (data.due) console.log(`[schedule] worker fired ${data.due} due post(s)`);
      syncScheduleCards(data.jobs);
      armNextPending(data.jobs);
    }
  } catch (e) {
    console.log('[schedule] worker error:', e.message);
    armScheduleTimer(Date.now() + RETRY_MS);
  } finally {
    scheduleWorkerRunning = false;
  }
}

app.post('/api/schedule/wake', (req, res) => {
  if (!homeServerAuthed(req)) return res.status(401).json({ error: 'bad or missing secret' });
  const scheduledAt = req.body && req.body.scheduledAt;
  if (!armScheduleTimer(scheduledAt)) return res.status(400).json({ error: 'invalid scheduledAt' });
  res.json({ ok: true, scheduledAt: new Date(scheduledAt).toISOString() });
});

setTimeout(scheduleWorkerTick, 8000);       // recover the queue shortly after launch
setInterval(scheduleWorkerTick, DAY_MS);    // one daily recovery check
console.log(`[schedule] event-driven timer enabled → ${POSTER_URL}${CRON_SECRET ? ' (secured)' : ''}`);

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
