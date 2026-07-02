import { Router } from 'express';
import { MsEdgeTTS } from 'msedge-tts';

export const voicesRouter = Router();

// The newest, most natural-sounding voices — surfaced first in the picker.
const PREFERRED = [
  'en-US-AvaMultilingualNeural',
  'en-US-AndrewMultilingualNeural',
  'en-US-EmmaMultilingualNeural',
  'en-US-BrianMultilingualNeural',
];

let cache = null;

voicesRouter.get('/voices', async (_req, res) => {
  try {
    if (!cache) {
      const all = await new MsEdgeTTS().getVoices();
      const neural = all
        .filter((v) => /Neural/i.test(v.ShortName))
        .map((v) => ({
          shortName: v.ShortName,
          name: v.FriendlyName || v.ShortName,
          locale: v.Locale,
          gender: v.Gender,
          multilingual: /Multilingual/i.test(v.ShortName),
        }));
      const rank = (v) => {
        const pref = PREFERRED.indexOf(v.shortName);
        if (pref !== -1) return pref;
        if (v.locale?.startsWith('en')) return 100 + (v.multilingual ? 0 : 1);
        return 1000;
      };
      neural.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      cache = neural;
    }
    res.json({ voices: cache });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not load voices.' });
  }
});
