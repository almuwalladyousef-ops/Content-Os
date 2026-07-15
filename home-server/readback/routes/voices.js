import { Router } from 'express';
import { LOCAL_VOICES } from '../config.js';

export const voicesRouter = Router();

voicesRouter.get('/voices', (_req, res) => {
  res.json({ engine: 'kokoro-local', free: true, voices: LOCAL_VOICES });
});
