'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Large-file storage for the Vercel app — replaces Vercel Blob.
 *
 * Files land under <dataDir>/files/<key>. JSON docs (dev fallback when the
 * Google Drive DB isn't configured) land under <dataDir>/json/<doc>.json.
 *
 * Auth: one shared secret, accepted as `Authorization: Bearer <secret>` or
 * `?secret=` (so the browser can direct-upload multi-GB videos, which can't
 * pass through a Vercel function). Personal app — deliberately nothing more.
 */
module.exports = function mountStorage(app, { dataDir, secret }) {
  const FILES_DIR = path.join(dataDir, 'files');
  const JSON_DIR = path.join(dataDir, 'json');
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(JSON_DIR, { recursive: true });

  function authed(req) {
    if (!secret) return true; // no secret configured → open (local dev)
    const header = String(req.headers.authorization || '');
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const candidate = bearer || String(req.query.secret || '');
    if (!candidate || candidate.length !== secret.length) return false;
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(secret));
  }

  // Keep keys inside the storage dirs (same guard idea as the vault routes)
  function resolveKey(baseDir, key) {
    const abs = path.resolve(baseDir, key || '');
    if (abs === baseDir || !abs.startsWith(baseDir + path.sep)) return null;
    return abs;
  }

  function guard(req, res) {
    if (!authed(req)) { res.status(401).json({ error: 'bad or missing secret' }); return false; }
    return true;
  }

  // ── Files ──────────────────────────────────────────────────────────────

  // Streamed upload; key may contain slashes, e.g. schedule/<id>/video.mp4
  app.put(/^\/storage\/file\/(.+)/, (req, res) => {
    if (!guard(req, res)) return;
    const abs = resolveKey(FILES_DIR, decodeURIComponent(req.params[0]));
    if (!abs) return res.status(400).json({ error: 'invalid key' });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + '.uploading';
    const out = fs.createWriteStream(tmp);
    let failed = false;
    req.on('error', () => { failed = true; out.destroy(); fs.rm(tmp, { force: true }, () => {}); });
    out.on('error', (e) => {
      failed = true;
      fs.rm(tmp, { force: true }, () => {});
      if (!res.headersSent) res.status(500).json({ error: e.message });
    });
    out.on('finish', () => {
      if (failed) return;
      try {
        fs.renameSync(tmp, abs);
        const meta = { contentType: req.headers['x-content-type'] || req.headers['content-type'] || 'application/octet-stream' };
        fs.writeFileSync(abs + '.meta.json', JSON.stringify(meta));
        res.json({ ok: true, key: req.params[0], size: fs.statSync(abs).size });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
    req.pipe(out);
  });

  // Streamed download (supports Range so <video>/<audio> seeking works)
  app.get(/^\/storage\/file\/(.+)/, (req, res) => {
    if (!guard(req, res)) return;
    const abs = resolveKey(FILES_DIR, decodeURIComponent(req.params[0]));
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'not found' });
    let contentType = 'application/octet-stream';
    try { contentType = JSON.parse(fs.readFileSync(abs + '.meta.json', 'utf8')).contentType || contentType; } catch {}
    res.sendFile(abs, { headers: { 'Content-Type': contentType }, acceptRanges: true });
  });

  app.delete(/^\/storage\/file\/(.+)/, (req, res) => {
    if (!guard(req, res)) return;
    const abs = resolveKey(FILES_DIR, decodeURIComponent(req.params[0]));
    if (!abs) return res.status(400).json({ error: 'invalid key' });
    fs.rm(abs, { force: true }, () => {});
    fs.rm(abs + '.meta.json', { force: true }, () => {});
    res.json({ ok: true });
  });

  // ── JSON docs (dev fallback store; prod state lives in the Drive DB) ───

  app.get('/storage/json/:doc', (req, res) => {
    if (!guard(req, res)) return;
    const abs = resolveKey(JSON_DIR, req.params.doc + '.json');
    if (!abs) return res.status(400).json({ error: 'invalid doc' });
    if (!fs.existsSync(abs)) return res.json(null);
    try { res.type('application/json').send(fs.readFileSync(abs, 'utf8')); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/storage/json/:doc', (req, res) => {
    if (!guard(req, res)) return;
    const abs = resolveKey(JSON_DIR, req.params.doc + '.json');
    if (!abs) return res.status(400).json({ error: 'invalid doc' });
    try {
      fs.writeFileSync(abs, JSON.stringify(req.body ?? null), 'utf8');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log(`[storage] mounted → ${dataDir}${secret ? ' (secret required)' : ' (OPEN — no HOME_SERVER_SECRET set)'}`);
};
