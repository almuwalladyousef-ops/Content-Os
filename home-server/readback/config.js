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

export const PORT = process.env.PORT || 5050;
export const LOCAL_VOICES = [
  { shortName: 'Reed (English (US))', name: 'Reed — natural (US)', locale: 'en-US', gender: 'male' },
  { shortName: 'Eddy (English (US))', name: 'Eddy — natural (US)', locale: 'en-US', gender: 'male' },
  { shortName: 'Flo (English (US))', name: 'Flo — natural (US)', locale: 'en-US', gender: 'female' },
  { shortName: 'Samantha', name: 'Samantha (US)', locale: 'en-US', gender: 'female' },
  { shortName: 'Daniel', name: 'Daniel (UK)', locale: 'en-GB', gender: 'male' },
  { shortName: 'Karen', name: 'Karen (AU)', locale: 'en-AU', gender: 'female' },
];
export const DEFAULT_VOICE = LOCAL_VOICES[0].shortName;

// Ensure runtime directories exist before anything reads/writes them.
for (const dir of [CACHE_DIR, LIBRARY_DIR]) {
  mkdirSync(dir, { recursive: true });
}
