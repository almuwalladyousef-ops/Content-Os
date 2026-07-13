import { Router } from 'express';
import { synthesize } from '../lib/tts/synthesize.js';
import {
  alignBoundariesToTokens, attachSentenceTimings, remapCachedPayload,
} from '../lib/tts/align.js';
import { hashKey, readCachePayload, writeCache } from '../lib/cache.js';
import { DEFAULT_VOICE } from '../config.js';

export const ttsRouter = Router();

async function handleTts(req, res) {
  try {
    const { tokens = [], sentences = [], voice = DEFAULT_VOICE } = req.body || {};
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'No tokens to synthesize.' });
    }

    const text = tokens.map((t) => t.text).join('');
    const hash = hashKey(text, voice);

    const cached = readCachePayload(hash);
    if (cached) {
      return res.json({
        audioUrl: `/api/readback/cache/${hash}.mp3`,
        ...remapCachedPayload(tokens, sentences, cached, voice),
      });
    }

    const { mp3, boundaries, durationMs } = await synthesize(text, voice);
    const words = alignBoundariesToTokens(tokens, boundaries);
    const timedSentences = attachSentenceTimings(sentences, words);

    const payload = { words, sentences: timedSentences, durationMs, voice };
    writeCache(hash, { mp3, payload });

    res.json({ audioUrl: `/api/readback/cache/${hash}.mp3`, ...payload });
  } catch (err) {
    console.error('[tts] synthesis failed:', err);
    res.status(500).json({ error: err.message || 'Synthesis failed.' });
  }
}

// Keep the original full-document route for older clients and explicit export
// workflows. Incremental clients send one sentence at a time to /tts/chunk.
ttsRouter.post('/tts', handleTts);
ttsRouter.post('/tts/chunk', handleTts);
