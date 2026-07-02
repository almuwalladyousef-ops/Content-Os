import { Router } from 'express';
import { extract } from '../lib/extract/index.js';
import { normalizeForSpeech } from '../lib/normalize.js';
import { toDisplayTokens } from '../lib/tokenize.js';

export const extractRouter = Router();

extractRouter.post('/extract', async (req, res) => {
  try {
    const { title, text } = await extract(req.body || {});
    const clean = normalizeForSpeech(text);
    if (!clean) {
      return res.status(422).json({ error: 'No readable text found in that input.' });
    }
    const { tokens, sentences } = toDisplayTokens(clean);
    const wordCount = tokens.filter((t) => t.type === 'word').length;
    const estMinutes = Math.max(1, Math.round(wordCount / 200));
    res.json({ title: title || '', tokens, sentences, wordCount, estMinutes });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Extraction failed.' });
  }
});
