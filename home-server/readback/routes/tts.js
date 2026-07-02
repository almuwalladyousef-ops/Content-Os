import { Router } from 'express';
import { synthesize } from '../lib/tts/synthesize.js';
import { alignBoundariesToTokens } from '../lib/tts/align.js';
import { hashKey, readCache, writeCache } from '../lib/cache.js';
import { DEFAULT_VOICE } from '../config.js';

export const ttsRouter = Router();

/** Give each sentence the offset of its first timed word (for skip/seek). */
function attachSentenceTimings(sentences, words) {
  const byToken = new Map(words.map((w) => [w.tokenIndex, w]));
  return sentences.map((s) => {
    let offsetMs = null;
    for (let t = s.tokenStart; t <= s.tokenEnd; t++) {
      const w = byToken.get(t);
      if (w && w.offsetMs != null) { offsetMs = w.offsetMs; break; }
    }
    return { ...s, offsetMs };
  });
}

ttsRouter.post('/tts', async (req, res) => {
  try {
    const { tokens = [], sentences = [], voice = DEFAULT_VOICE } = req.body || {};
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'No tokens to synthesize.' });
    }

    const text = tokens.map((t) => t.text).join('');
    const hash = hashKey(text, voice);

    const cached = readCache(hash);
    if (cached) {
      return res.json({ audioUrl: `/api/readback/cache/${hash}.mp3`, ...cached.payload });
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
});
