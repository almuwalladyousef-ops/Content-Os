import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_VOICE, LOCAL_VOICES, MODELS_DIR } from '../../config.js';

const execFileAsync = promisify(execFile);
const ENCODE_TIMEOUT_MS = 60000;
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// Kokoro truncates past ~510 phoneme tokens, so text is generated in
// sentence-packed segments and stitched into one continuous waveform.
const MAX_SEGMENT_CHARS = 400;
const SENTENCE_PAUSE_MS = 90;
const PARAGRAPH_PAUSE_MS = 260;

const LEGACY_VOICES = new Map([
  // First engine: Microsoft Edge neural voices.
  ['en-US-AvaMultilingualNeural', 'af_heart'],
  ['en-US-EmmaMultilingualNeural', 'af_bella'],
  ['en-US-AndrewMultilingualNeural', 'am_michael'],
  ['en-US-BrianMultilingualNeural', 'am_fenrir'],
  ['en-GB-SoniaNeural', 'bf_emma'],
  ['en-AU-NatashaNeural', 'bf_emma'],
  // Second engine: local macOS `say` voices.
  ['Reed (English (US))', 'am_michael'],
  ['Eddy (English (US))', 'am_fenrir'],
  ['Flo (English (US))', 'af_bella'],
  ['Samantha', 'af_heart'],
  ['Daniel', 'bm_george'],
  ['Karen', 'bf_emma'],
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

/** Approximate word timings; Kokoro does not export per-word boundaries. */
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

/**
 * Split text into segments Kokoro can voice in one pass. Segments are exact,
 * ordered slices of the input (never splitting inside a word), so per-segment
 * word boundaries concatenate into the same word sequence as the full text.
 * Each segment carries the pause to insert after it, read from the whitespace
 * that opens the next segment (paragraph break vs. sentence gap).
 */
export function splitSegments(text) {
  const src = String(text ?? '');
  if (!src) return [];

  // Pack sentence-sized units of src[from..to) into capped [start, end) slices.
  const packRange = (from, to) => {
    const breaks = [];
    const re = /[.!?…]+["'")\]]*(?=\s|$)|\n/g;
    re.lastIndex = from;
    let match;
    while ((match = re.exec(src)) && match.index < to) {
      breaks.push(Math.min(match.index + match[0].length, to));
    }
    if (breaks[breaks.length - 1] !== to) breaks.push(to);

    const slices = [];
    let segStart = from;
    let lastGood = -1;
    for (const b of breaks) {
      if (b - segStart <= MAX_SEGMENT_CHARS) { lastGood = b; continue; }
      if (lastGood > segStart) {
        slices.push([segStart, lastGood]);
        segStart = lastGood;
        lastGood = -1;
        if (b - segStart <= MAX_SEGMENT_CHARS) { lastGood = b; continue; }
      }
      // A single unit longer than the cap: split it at whitespace.
      while (b - segStart > MAX_SEGMENT_CHARS) {
        let cut = src.lastIndexOf(' ', segStart + MAX_SEGMENT_CHARS);
        if (cut <= segStart) cut = segStart + MAX_SEGMENT_CHARS;
        slices.push([segStart, cut]);
        segStart = cut;
      }
      lastGood = b;
    }
    if (lastGood > segStart) slices.push([segStart, lastGood]);
    else if (segStart < to) slices.push([segStart, to]);
    return slices;
  };

  // Paragraphs are hard cut points, so paragraph pauses always land on a
  // segment edge (and Kokoro restarts intonation naturally at each one).
  const paragraphs = [];
  const paraRe = /\n\s*\n/g;
  let paraStart = 0;
  let sep;
  while ((sep = paraRe.exec(src))) {
    paragraphs.push([paraStart, sep.index + sep[0].length]);
    paraStart = sep.index + sep[0].length;
  }
  if (paraStart < src.length) paragraphs.push([paraStart, src.length]);

  const segments = [];
  for (let p = 0; p < paragraphs.length; p++) {
    const slices = packRange(paragraphs[p][0], paragraphs[p][1]);
    for (let i = 0; i < slices.length; i++) {
      const lastInParagraph = i === slices.length - 1;
      const lastOverall = lastInParagraph && p === paragraphs.length - 1;
      segments.push({
        text: src.slice(slices[i][0], slices[i][1]),
        pauseMs: lastOverall ? 0 : lastInParagraph ? PARAGRAPH_PAUSE_MS : SENTENCE_PAUSE_MS,
      });
    }
  }
  return segments;
}

// One shared model instance; loads on first use (and pre-warms from the
// extract/library routes so the download+init cost is paid before playback).
let ttsPromise = null;
function loadTts() {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      // Same hoisted module instance kokoro-js uses; point its download cache
      // at the mini's data dir so model files survive node_modules reinstalls.
      const { env } = await import('@huggingface/transformers');
      env.cacheDir = MODELS_DIR;
      const { KokoroTTS } = await import('kokoro-js');
      return KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: process.env.READBACK_TTS_DTYPE || 'q8',
        device: 'cpu',
      });
    })();
    ttsPromise.catch(() => { ttsPromise = null; });
  }
  return ttsPromise;
}

export function warmUpTts() {
  loadTts().catch((err) => console.error('[tts] model warm-up failed:', err.message));
}

// Generations run one at a time so a quick-start request is never starved by
// a long article generating in parallel (the ONNX session is CPU-bound).
let generateQueue = Promise.resolve();
function enqueueGenerate(task) {
  const run = generateQueue.then(task, task);
  generateQueue = run.then(() => {}, () => {});
  return run;
}

function speakingSpeed() {
  const explicit = Number(process.env.READBACK_TTS_SPEED);
  const legacyRate = Number(process.env.READBACK_SAY_RATE);
  const speed = explicit || (legacyRate ? legacyRate / 185 : 1);
  return Math.max(0.6, Math.min(1.5, speed));
}

/** Render one continuous, free, offline MP3 with a local Kokoro neural voice. */
export async function synthesize(text, voice) {
  const tts = await loadTts();
  const selectedVoice = resolveVoice(voice);
  const speed = speakingSpeed();

  const clips = [];
  const boundaries = [];
  let sampleRate = 24000;
  let totalSamples = 0;
  let cursorMs = 0;
  const addSilence = (ms) => {
    const samples = Math.round((sampleRate * ms) / 1000);
    if (!samples) return;
    clips.push(new Float32Array(samples));
    totalSamples += samples;
    cursorMs += (samples / sampleRate) * 1000;
  };

  for (const segment of splitSegments(text)) {
    if (!/[\p{L}\p{N}]/u.test(segment.text)) {
      if (segment.pauseMs) addSilence(segment.pauseMs);
      continue;
    }
    const audio = await enqueueGenerate(
      () => tts.generate(segment.text, { voice: selectedVoice, speed }),
    );
    sampleRate = audio.sampling_rate || sampleRate;
    const clipMs = (audio.audio.length / sampleRate) * 1000;
    for (const boundary of estimateBoundaries(segment.text, clipMs)) {
      boundaries.push({ ...boundary, offsetMs: boundary.offsetMs + cursorMs });
    }
    clips.push(audio.audio);
    totalSamples += audio.audio.length;
    cursorMs += clipMs;
    if (segment.pauseMs) addSilence(segment.pauseMs);
  }

  if (!totalSamples) throw new Error('There is nothing to narrate in that text.');

  const pcm = new Float32Array(totalSamples);
  let offset = 0;
  for (const clip of clips) { pcm.set(clip, offset); offset += clip.length; }
  const durationMs = (totalSamples / sampleRate) * 1000;

  const { RawAudio } = await import('@huggingface/transformers');
  const wav = Buffer.from(new RawAudio(pcm, sampleRate).toWav());

  const workDir = mkdtempSync(join(tmpdir(), 'readback-tts-'));
  const wavPath = join(workDir, 'voice.wav');
  const mp3Path = join(workDir, 'voice.mp3');
  try {
    writeFileSync(wavPath, wav);
    await execFileAsync(ffmpegPath(), [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath,
      '-codec:a', 'libmp3lame', '-b:a', '64k', mp3Path,
    ], { timeout: ENCODE_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
    return { mp3: readFileSync(mp3Path), boundaries, durationMs };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
