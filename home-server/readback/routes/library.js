import { Router } from 'express';
import {
  saveArticle, listArticles, getArticle,
  updateProgress, markRead, deleteArticle,
} from '../lib/store.js';
import { warmUpTts } from '../lib/tts/synthesize.js';

export const libraryRouter = Router();

libraryRouter.get('/library', (_req, res) => {
  res.json({ articles: listArticles() });
});

libraryRouter.post('/library', (req, res) => {
  const rec = saveArticle(req.body || {});
  res.status(201).json(rec);
});

libraryRouter.get('/library/:id', (req, res) => {
  // Opening a saved reading leads straight to narration — pre-warm the model.
  warmUpTts();
  const rec = getArticle(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found.' });
  res.json(rec);
});

libraryRouter.patch('/library/:id', (req, res) => {
  const { progressMs, read } = req.body || {};
  let rec = null;
  if (progressMs != null) rec = updateProgress(req.params.id, progressMs);
  if (read != null) rec = markRead(req.params.id, read);
  if (!rec) return res.status(404).json({ error: 'Not found.' });
  res.json(rec);
});

libraryRouter.delete('/library/:id', (req, res) => {
  deleteArticle(req.params.id);
  res.json({ ok: true });
});
