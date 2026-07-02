'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

/**
 * LinkScribe job runner — download a public video URL with yt-dlp and transcribe
 * it with LOCAL Whisper (free; runs on the always-on Mac mini). Faithful CJS port
 * of linkscribe/lib/transcribe/*. Jobs live at <dataDir>/linkscribe/jobs/<id>/.
 *
 * The Vercel app proxies /api/linkscribe/* → here with the shared bearer secret.
 */
module.exports = function mountLinkscribe(app, { dataDir, secret }) {
  const JOBS_DIR = path.join(dataDir, 'linkscribe', 'jobs');
  fs.mkdirSync(JOBS_DIR, { recursive: true });

  function authed(req) {
    if (!secret) return true;
    const header = String(req.headers.authorization || '');
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const candidate = bearer || String(req.query.secret || '');
    if (!candidate || candidate.length !== secret.length) return false;
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(secret));
  }
  function guard(req, res) {
    if (!authed(req)) { res.status(401).json({ error: 'bad or missing secret' }); return false; }
    return true;
  }

  function jobDir(id) {
    if (!/^job_[a-f0-9-]+$/i.test(id)) return null;
    const dir = path.resolve(JOBS_DIR, id);
    if (dir === JOBS_DIR || !dir.startsWith(JOBS_DIR + path.sep)) return null;
    return dir;
  }
  function readJob(id) {
    const dir = jobDir(id);
    if (!dir) return null;
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8')); } catch { return null; }
  }
  function writeJob(job) {
    fs.writeFileSync(path.join(jobDir(job.id), 'job.json'), JSON.stringify(job, null, 2), 'utf8');
  }
  function patchJob(id, fields) {
    const job = readJob(id);
    if (!job) return null;
    Object.assign(job, fields, { updatedAt: new Date().toISOString() });
    writeJob(job);
    return job;
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  app.post('/linkscribe/jobs', (req, res) => {
    if (!guard(req, res)) return;
    const url = String(req.body?.url || '').trim();
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Paste a valid video URL.' }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Use an http or https video link.' });
    }

    const id = `job_${randomUUID()}`;
    fs.mkdirSync(jobDir(id), { recursive: true });
    const job = {
      id, sourceUrl: url, title: '', status: 'pending', error: null,
      mediaFilename: null, transcriptFilename: null,
      segments: null, transcriptText: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    writeJob(job);

    // Process async; the UI polls GET /linkscribe/jobs/:id.
    processJob(id).catch(err => {
      patchJob(id, { status: 'failed', error: err.message || 'Transcription failed.' });
    });

    res.status(201).json(publicJob(job));
  });

  app.get('/linkscribe/jobs/:id', (req, res) => {
    if (!guard(req, res)) return;
    const job = readJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json(publicJob(job));
  });

  app.get('/linkscribe/jobs/:id/media', (req, res) => {
    if (!guard(req, res)) return;
    const job = readJob(req.params.id);
    const dir = jobDir(req.params.id);
    if (!job || !job.mediaFilename || !dir) return res.status(404).json({ error: 'Media not found.' });
    const abs = path.join(dir, job.mediaFilename);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Media not found.' });
    res.sendFile(abs, { acceptRanges: true });
  });

  app.get('/linkscribe/jobs/:id/transcript', (req, res) => {
    if (!guard(req, res)) return;
    const job = readJob(req.params.id);
    const dir = jobDir(req.params.id);
    if (!job || !job.transcriptFilename || !dir) return res.status(404).json({ error: 'Transcript not found.' });
    const abs = path.join(dir, job.transcriptFilename);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Transcript not found.' });
    res.type('text/plain').sendFile(abs);
  });

  function publicJob(job) {
    return {
      jobId: job.id, status: job.status, title: job.title, error: job.error,
      sourceUrl: job.sourceUrl, segments: job.segments, transcriptText: job.transcriptText,
      downloads: { media: `/api/linkscribe/jobs/${job.id}/media`, transcript: `/api/linkscribe/jobs/${job.id}/transcript` },
      createdAt: job.createdAt,
    };
  }

  // ── Pipeline ────────────────────────────────────────────────────────────

  async function processJob(id) {
    const dir = jobDir(id);
    patchJob(id, { status: 'downloading' });
    const media = await downloadMedia(readJob(id).sourceUrl, dir);
    patchJob(id, { status: 'transcribing', title: media.title, mediaFilename: path.basename(media.path) });

    const segments = await transcribeAudio(media.path, dir);
    const transcriptText = formatTranscript(segments);
    fs.writeFileSync(path.join(dir, 'transcript.txt'), transcriptText, 'utf8');

    patchJob(id, { status: 'done', segments, transcriptText, transcriptFilename: 'transcript.txt' });
  }

  console.log(`[linkscribe] mounted → ${JOBS_DIR}${secret ? ' (secret required)' : ' (OPEN — no HOME_SERVER_SECRET set)'}`);
};

// ── Command helpers (module scope; no closure needed) ───────────────────────

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; });
    child.stderr.on('data', c => { stderr += c; });
    child.on('error', err => {
      if (err.code === 'ENOENT') return reject(new Error(`Missing command: ${command}. Install it and try again.`));
      reject(err);
    });
    child.on('close', code => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(stderr.trim() || `${command} exited with status ${code}.`));
    });
  });
}

function ytDlpAuthArgs() {
  const browser = process.env.LINKSCRIBE_YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ['--cookies-from-browser', browser];
  const cookiesFile = process.env.LINKSCRIBE_YTDLP_COOKIES?.trim();
  if (cookiesFile) return ['--cookies', cookiesFile];
  return [];
}

async function downloadMedia(url, dir) {
  const outputTemplate = path.join(dir, 'media.%(ext)s');
  const result = await run('yt-dlp', [
    '--no-playlist', ...ytDlpAuthArgs(),
    '--print', 'after_move:filepath', '--print', 'title',
    '-f', 'bv*[vcodec!=none]+ba[acodec!=none]/b[vcodec!=none]/best[vcodec!=none]',
    '--merge-output-format', 'mp4', '-o', outputTemplate, url,
  ]);

  const lines = result.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let mediaPath = lines.find(l => l.startsWith(dir)) || findMediaFile(dir);
  const title = lines.find(l => !l.startsWith(dir)) || 'Video';
  if (!mediaPath) throw new Error('The video downloaded, but the media file could not be found.');

  const quickTimePath = await ensureQuickTimeCompatible(mediaPath, dir);
  return { path: quickTimePath, title };
}

function findMediaFile(dir) {
  const media = fs.readdirSync(dir).find(e => /^media\.(mp4|webm|mkv|mov|m4a|mp3|wav)$/i.test(e));
  return media ? path.join(dir, media) : null;
}

async function getMediaCodecs(mediaPath) {
  const result = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', mediaPath]);
  const parsed = JSON.parse(result.stdout);
  const video = parsed.streams?.find(s => s.codec_type === 'video');
  const audio = parsed.streams?.find(s => s.codec_type === 'audio');
  return { videoCodec: video?.codec_name ?? null, audioCodec: audio?.codec_name ?? null };
}

async function ensureQuickTimeCompatible(mediaPath, dir) {
  let codecs;
  try { codecs = await getMediaCodecs(mediaPath); } catch { return mediaPath; }
  const v = codecs.videoCodec?.toLowerCase();
  const a = codecs.audioCodec?.toLowerCase();
  if (v === 'h264' && (!a || a === 'aac' || a === 'mp3')) return mediaPath;

  const outputPath = path.join(dir, 'media-quicktime.mp4');
  await run('ffmpeg', ['-y', '-i', mediaPath, '-c:v', 'libx264', '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', outputPath]);
  return outputPath;
}

async function resolveWhisperCommand() {
  const configured = process.env.LINKSCRIBE_WHISPER_COMMAND?.trim();
  if (configured) return configured;
  const home = process.env.HOME;
  if (!home) return 'whisper';
  const pythonRoot = path.join(home, 'Library', 'Python');
  try {
    for (const version of fs.readdirSync(pythonRoot).sort().reverse()) {
      const candidate = path.join(pythonRoot, version, 'bin', 'whisper');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* fall through */ }
  return 'whisper';
}

async function transcribeAudio(mediaPath, dir) {
  const model = process.env.LINKSCRIBE_WHISPER_MODEL || 'base';
  const whisperCommand = await resolveWhisperCommand();
  try {
    await run(whisperCommand, [mediaPath, '--model', model, '--output_format', 'json', '--output_dir', dir]);
  } catch (err) {
    // Optional Groq fallback if local Whisper is unavailable and a key is set.
    if (process.env.GROQ_API_KEY) return transcribeViaGroq(mediaPath);
    throw new Error(err.message.includes('Missing command') ? err.message : 'Transcription failed. Check that local Whisper is installed.');
  }
  const jsonPath = fs.readdirSync(dir).map(e => path.join(dir, e)).find(p => p.endsWith('.json') && !p.endsWith('job.json'));
  if (!jsonPath) throw new Error('Transcription finished, but no transcript JSON was created.');
  return parseWhisperJson(fs.readFileSync(jsonPath, 'utf8'));
}

function parseWhisperJson(contents) {
  const parsed = JSON.parse(contents);
  return (parsed.segments ?? [])
    .map(s => ({ startSeconds: Number(s.start ?? 0), endSeconds: Number(s.end ?? s.start ?? 0), text: String(s.text ?? '').trim() }))
    .filter(s => s.text.length > 0);
}

async function transcribeViaGroq(mediaPath) {
  const form = new FormData();
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('file', new Blob([fs.readFileSync(mediaPath)]), path.basename(mediaPath));
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Groq transcription failed.');
  return (data.segments ?? [])
    .map(s => ({ startSeconds: Number(s.start ?? 0), endSeconds: Number(s.end ?? s.start ?? 0), text: String(s.text ?? '').trim() }))
    .filter(s => s.text.length > 0);
}

function formatTranscript(segments) {
  return segments.map(s => {
    const fmt = sec => {
      const r = Math.round(sec);
      return [Math.floor(r / 3600), Math.floor((r % 3600) / 60), r % 60].map(p => String(p).padStart(2, '0')).join(':');
    };
    return `[${fmt(s.startSeconds)} - ${fmt(s.endSeconds)}] ${s.text.trim()}`;
  }).join('\n');
}
