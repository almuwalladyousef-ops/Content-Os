import { execFile } from 'node:child_process';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_VOICE, LOCAL_VOICES } from '../../config.js';

const execFileAsync = promisify(execFile);
const SYNTHESIS_TIMEOUT_MS = 180000;
const DEFAULT_RATE = 185;

const LEGACY_VOICES = new Map([
  ['en-US-AvaMultilingualNeural', 'Reed (English (US))'],
  ['en-US-AndrewMultilingualNeural', 'Eddy (English (US))'],
  ['en-US-EmmaMultilingualNeural', 'Flo (English (US))'],
  ['en-US-BrianMultilingualNeural', 'Reed (English (US))'],
  ['en-GB-SoniaNeural', 'Daniel'],
  ['en-AU-NatashaNeural', 'Karen'],
]);

export function resolveVoice(voice) {
  const requested = String(voice || DEFAULT_VOICE);
  const migrated = LEGACY_VOICES.get(requested) || requested;
  return LOCAL_VOICES.some((item) => item.shortName === migrated) ? migrated : DEFAULT_VOICE;
}

function ffmpegPath() {
  const candidates = [
    process.env.READBACK_FFMPEG_PATH,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Local narration needs ffmpeg on the Mac mini (brew install ffmpeg).');
  return found;
}

/** Approximate word timings because macOS `say` does not export boundaries. */
export function estimateBoundaries(text, durationMs) {
  const source = String(text ?? '');
  const matches = [...source.matchAll(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)];
  if (!matches.length || !Number.isFinite(durationMs) || durationMs <= 0) return [];

  const weights = matches.map((match, index) => {
    const word = match[0];
    const end = (match.index || 0) + word.length;
    const nextStart = matches[index + 1]?.index ?? source.length;
    const between = source.slice(end, nextStart);
    const wordWeight = 1 + Math.min(1.5, word.length / 8);
    const pauseWeight = /\n\s*\n/.test(between)
      ? 2.8
      : /[.!?]/.test(between)
        ? 1.8
        : /[,;:—]/.test(between)
          ? 0.8
          : 0.12;
    return { word, wordWeight, total: wordWeight + pauseWeight };
  });

  const totalWeight = weights.reduce((sum, item) => sum + item.total, 0);
  const scale = durationMs / totalWeight;
  let cursor = 0;
  return weights.map((item) => {
    const boundary = {
      word: item.word,
      offsetMs: cursor * scale,
      durationMs: item.wordWeight * scale,
    };
    cursor += item.total;
    return boundary;
  });
}

/** Render one continuous, free, offline MP3 with a local macOS voice. */
export async function synthesize(text, voice) {
  if (process.platform !== 'darwin') {
    throw new Error('Local Readback narration requires the macOS home server.');
  }

  const workDir = mkdtempSync(join(tmpdir(), 'readback-tts-'));
  const inputPath = join(workDir, 'input.txt');
  const aiffPath = join(workDir, 'voice.aiff');
  const mp3Path = join(workDir, 'voice.mp3');
  const ffmpeg = ffmpegPath();
  const ffprobe = join(dirname(ffmpeg), 'ffprobe');
  const selectedVoice = resolveVoice(voice);
  const rate = Math.max(120, Math.min(260, Number(process.env.READBACK_SAY_RATE) || DEFAULT_RATE));

  try {
    writeFileSync(inputPath, String(text ?? ''), 'utf8');
    await execFileAsync('/usr/bin/say', [
      '-v', selectedVoice, '-r', String(rate), '-f', inputPath, '-o', aiffPath,
    ], { timeout: SYNTHESIS_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
    await execFileAsync(ffmpeg, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', aiffPath,
      '-codec:a', 'libmp3lame', '-b:a', '64k', mp3Path,
    ], { timeout: SYNTHESIS_TIMEOUT_MS, maxBuffer: 1024 * 1024 });

    const mp3 = readFileSync(mp3Path);
    let durationMs = mp3.length / 8;
    if (existsSync(ffprobe)) {
      const { stdout } = await execFileAsync(ffprobe, [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1', mp3Path,
      ], { timeout: 10000, maxBuffer: 1024 * 1024 });
      const measured = Number(String(stdout).trim()) * 1000;
      if (Number.isFinite(measured) && measured > 0) durationMs = measured;
    }

    return { mp3, boundaries: estimateBoundaries(text, durationMs), durationMs };
  } catch (err) {
    if (err?.killed || err?.signal === 'SIGTERM') {
      throw new Error('Local voice generation took too long. Try a shorter article.');
    }
    throw err;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
