import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const TICKS_PER_MS = 10000; // edge offsets are in 100-nanosecond ticks
const MAX_CHUNK_CHARS = 1600; // smaller chunks finish faster and parallelize better
const CHUNK_TIMEOUT_MS = 60000; // generous safety net for a truly stalled connection

/** XML-escape text before it is embedded in the SSML template. */
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Split text into synthesis chunks of at most `max` chars, preferring paragraph
 * boundaries and falling back to sentence boundaries for oversized paragraphs.
 * Pure — unit tested.
 */
export function chunkText(text, max = MAX_CHUNK_CHARS) {
  const paras = String(text ?? '').split(/\n\n+/);
  const chunks = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
  };

  for (const para of paras) {
    if (para.length > max) {
      flush();
      const sentences = para.match(/[^.!?]+[.!?]*\s*/g) || [para];
      let buf = '';
      for (const s of sentences) {
        if (buf && (buf + s).length > max) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf += s;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
    } else if (cur && (cur + '\n\n' + para).length > max) {
      flush();
      cur = para;
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  flush();
  return chunks.length ? chunks : [''];
}

// 48 kbps constant-bitrate mono MP3 => 6000 bytes/sec => 6 bytes/ms.
// A chunk's true audio length (including trailing silence) is its byte count / 6,
// which is what the concatenated stream actually plays — far more accurate than
// the last word boundary, so highlight timing doesn't drift across chunks.
const MP3_BYTES_PER_MS = 6;

/**
 * Stitch per-chunk audio + boundaries into one globally-timed result.
 * Each chunk's boundary offsets are local; shift them by a running cursor and
 * advance the cursor by that chunk's real audio duration.
 * Pure — unit tested.
 */
export function accumulateOffsets(chunks) {
  const boundaries = [];
  const buffers = [];
  let cursor = 0;

  for (const chunk of chunks) {
    for (const b of chunk.boundaries) {
      boundaries.push({
        word: b.word,
        offsetMs: b.offsetMs + cursor,
        durationMs: b.durationMs,
      });
    }
    if (chunk.audio?.length) buffers.push(chunk.audio);
    if (chunk.audio?.length) {
      cursor += chunk.audio.length / MP3_BYTES_PER_MS;
    } else {
      const last = chunk.boundaries[chunk.boundaries.length - 1];
      cursor += last ? last.offsetMs + last.durationMs : 0;
    }
  }

  const mp3 = Buffer.concat(buffers);
  const durationMs = mp3.length ? mp3.length / MP3_BYTES_PER_MS : 0;
  return { mp3, boundaries, durationMs };
}

/** Synthesize a single chunk over the Edge websocket. Network call. */
function synthesizeChunk(text, voice) {
  return new Promise(async (resolve, reject) => {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true,
        sentenceBoundaryEnabled: false,
      });
      const { audioStream, metadataStream } = tts.toStream(escapeXml(text));

      const audioChunks = [];
      const boundaries = [];
      let audioDone = false;
      let metaDone = !metadataStream;
      let finished = false;

      // Guard against a stalled Edge connection hanging the request forever.
      // Fail loudly rather than returning truncated narration.
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        tts.close?.();
        reject(new Error('Voice service timed out. Try again or pick another voice.'));
      }, CHUNK_TIMEOUT_MS);

      const settle = () => {
        if (finished || !audioDone || !metaDone) return;
        finished = true;
        clearTimeout(timer);
        tts.close?.();
        resolve({ audio: Buffer.concat(audioChunks), boundaries });
      };
      const fail = (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        tts.close?.();
        reject(err);
      };

      // Audio emits 'end' then 'close'; metadata emits only 'close'. Settle when
      // both have closed.
      audioStream.on('data', (d) => audioChunks.push(d));
      const markAudio = () => { audioDone = true; settle(); };
      audioStream.on('end', markAudio);
      audioStream.on('close', markAudio);
      audioStream.on('error', fail);

      if (metadataStream) {
        metadataStream.on('data', (chunk) => {
          let obj;
          try { obj = JSON.parse(chunk.toString()); } catch { return; }
          for (const item of obj.Metadata || []) {
            if (item.Type !== 'WordBoundary') continue;
            const data = item.Data || {};
            boundaries.push({
              word: data.text?.Text ?? data.Text ?? '',
              offsetMs: (data.Offset ?? 0) / TICKS_PER_MS,
              durationMs: (data.Duration ?? 0) / TICKS_PER_MS,
            });
          }
        });
        const markMeta = () => { metaDone = true; settle(); };
        metadataStream.on('end', markMeta);
        metadataStream.on('close', markMeta);
        metadataStream.on('error', fail);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Run async `fn` over `items` with a bounded number of concurrent calls,
 * preserving order. On the first failure, stop pulling new work and rethrow it
 * once all in-flight calls have settled (no unhandled rejections).
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let firstError = null;
  async function worker() {
    while (next < items.length && !firstError) {
      const idx = next++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  if (firstError) throw firstError;
  return results;
}

/**
 * Synthesize full text into one MP3 buffer plus globally-timed word boundaries.
 * Chunks are synthesized concurrently (bounded) so a long article doesn't take
 * the sum of every chunk's round-trip — it takes roughly the slowest batch.
 * @returns {Promise<{ mp3: Buffer, boundaries: Array, durationMs: number }>}
 */
export async function synthesize(text, voice) {
  const chunks = chunkText(text);
  const results = await mapWithConcurrency(chunks, 3, (chunk) => synthesizeChunk(chunk, voice));
  return accumulateOffsets(results);
}
