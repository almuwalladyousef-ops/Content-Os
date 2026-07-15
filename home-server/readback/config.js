import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT = join(__dirname, '..');
export const PUBLIC_DIR = join(ROOT, 'public'); // unused in the suite (UI is ported to Next)
// Data lives under the mini's shared data dir, not inside the repo. The home
// server sets READBACK_DATA_DIR = <DATA_DIR>/readback before importing this.
export const DATA_DIR = process.env.READBACK_DATA_DIR || join(ROOT, 'data');
export const CACHE_DIR = join(DATA_DIR, 'cache');
export const LIBRARY_DIR = join(DATA_DIR, 'library');
// Kokoro model weights download here once (~90 MB) and are reused offline after.
export const MODELS_DIR = join(DATA_DIR, 'models');

export const PORT = process.env.PORT || 5050;
// Kokoro voices (neural, free, generated locally). shortName is the model's voice id.
export const LOCAL_VOICES = [
  { shortName: 'af_heart', name: 'Heart — natural (US)', locale: 'en-US', gender: 'female' },
  { shortName: 'af_bella', name: 'Bella — warm (US)', locale: 'en-US', gender: 'female' },
  { shortName: 'af_nicole', name: 'Nicole — soft (US)', locale: 'en-US', gender: 'female' },
  { shortName: 'am_michael', name: 'Michael — calm (US)', locale: 'en-US', gender: 'male' },
  { shortName: 'am_fenrir', name: 'Fenrir — bold (US)', locale: 'en-US', gender: 'male' },
  { shortName: 'bf_emma', name: 'Emma — natural (UK)', locale: 'en-GB', gender: 'female' },
  { shortName: 'bm_george', name: 'George — steady (UK)', locale: 'en-GB', gender: 'male' },
];
export const DEFAULT_VOICE = LOCAL_VOICES[0].shortName;

// Ensure runtime directories exist before anything reads/writes them.
for (const dir of [CACHE_DIR, LIBRARY_DIR, MODELS_DIR]) {
  mkdirSync(dir, { recursive: true });
}
