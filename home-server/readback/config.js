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
export const DEFAULT_VOICE = 'en-US-AvaMultilingualNeural';

// Ensure runtime directories exist before anything reads/writes them.
for (const dir of [CACHE_DIR, LIBRARY_DIR]) {
  mkdirSync(dir, { recursive: true });
}
