import express from 'express';
import { CACHE_DIR } from './config.js';
import { extractRouter } from './routes/extract.js';
import { ttsRouter } from './routes/tts.js';
import { voicesRouter } from './routes/voices.js';
import { libraryRouter } from './routes/library.js';

/**
 * Mounts the Readback engine (Microsoft Edge neural TTS + article extraction +
 * karaoke timing + saved library) under `/readback-api/*` on the given Express
 * app. ESM module — server.js loads it via dynamic import() because server.js is
 * CommonJS. Data dirs come from config.js (READBACK_DATA_DIR, set by server.js).
 */
export function mountReadback(app, { basePath = '/readback-api' } = {}) {
  const r = express.Router();
  r.use(express.json({ limit: '5mb' }));

  // Content-addressed narration MP3s — safe to cache hard.
  r.use('/cache', express.static(CACHE_DIR, {
    setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
  }));

  r.get('/health', (_req, res) => res.json({ ok: true }));
  r.use('/', extractRouter);
  r.use('/', ttsRouter);
  r.use('/', voicesRouter);
  r.use('/', libraryRouter);

  app.use(basePath, r);
  console.log(`[readback] mounted → ${basePath}`);
}
