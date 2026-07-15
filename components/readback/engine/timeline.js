// Pure helpers for Readback's single-track narration timeline.

const MS_PER_WORD = 330;
const SENTENCE_PADDING_MS = 260;
const MIN_READING_MS = 700;
// Neural narration generates at only a few times real-time, so readings are
// cut into ramped chunks: a tiny quick-start that is audible within seconds,
// a short ramp chunk, then steady chunks of roughly a spoken minute each.
const CHUNK_LIMITS = [
  { words: 48, chars: 400 },
  { words: 120, chars: 900 },
  { words: 220, chars: 1600 },
];
const limitFor = (index) => CHUNK_LIMITS[Math.min(index, CHUNK_LIMITS.length - 1)];

function estimateDuration(tokens) {
  const words = tokens.filter((token) => token.type === 'word').length;
  return Math.max(MIN_READING_MS, words * MS_PER_WORD + SENTENCE_PADDING_MS);
}

function makeChunk(tokens, sentences) {
  return {
    tokens,
    sentences,
    tokenStart: tokens[0]?.i ?? 0,
    tokenEnd: tokens[tokens.length - 1]?.i ?? 0,
    estimatedDurationMs: estimateDuration(tokens),
    result: null,
    promise: null,
    error: null,
  };
}

/**
 * Cut the reading into sentence-aligned chunks sized by CHUNK_LIMITS. Short
 * readings remain one continuous track; long ones become a run of chunks the
 * player queues gaplessly while lookahead prefetch keeps generation ahead of
 * playback.
 */
export function buildSynthesisChunks(article) {
  const tokens = Array.isArray(article?.tokens) ? article.tokens : [];
  const sentences = Array.isArray(article?.sentences) ? article.sentences : [];
  if (!tokens.some((token) => token.type === 'word')) return [];

  const chunks = [];
  let tokenStart = 0;
  let sentenceStart = 0;
  let words = 0;
  let chars = 0;
  for (let i = 0; i < sentences.length - 1; i++) {
    const sentence = sentences[i];
    const sentenceTokens = tokens.slice(sentence.tokenStart, sentence.tokenEnd + 1);
    words += sentenceTokens.filter((token) => token.type === 'word').length;
    chars += sentenceTokens.reduce((sum, token) => sum + token.text.length, 0);
    const limit = limitFor(chunks.length);
    if (words >= limit.words || chars >= limit.chars) {
      const nextToken = sentences[i + 1].tokenStart;
      chunks.push(makeChunk(tokens.slice(tokenStart, nextToken), sentences.slice(sentenceStart, i + 1)));
      tokenStart = nextToken;
      sentenceStart = i + 1;
      words = 0;
      chars = 0;
    }
  }
  chunks.push(makeChunk(tokens.slice(tokenStart), sentences.slice(sentenceStart)));
  return chunks;
}

function shiftedOffset(offsetMs, startMs) {
  return offsetMs == null ? null : offsetMs + startMs;
}

/** Combine the ready result or lightweight pre-generation timing estimates. */
export function assembleTimeline(chunks) {
  const words = [];
  const sentences = [];
  let cursorMs = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const result = chunk.result;
    const durationMs = Math.max(
      1,
      Number(result?.durationMs) || Number(chunk.estimatedDurationMs) || MIN_READING_MS,
    );

    if (result?.words?.length) {
      for (const word of result.words) {
        words.push({
          ...word,
          offsetMs: shiftedOffset(word.offsetMs, cursorMs),
          chunkIndex,
          estimated: false,
        });
      }
    } else {
      const chunkWords = chunk.tokens.filter((token) => token.type === 'word');
      const step = durationMs / Math.max(1, chunkWords.length);
      for (let i = 0; i < chunkWords.length; i++) {
        const token = chunkWords[i];
        words.push({
          tokenIndex: token.i,
          text: token.text,
          offsetMs: cursorMs + i * step,
          durationMs: step,
          chunkIndex,
          estimated: true,
        });
      }
    }

    const resultSentences = result?.sentences?.length ? result.sentences : chunk.sentences;
    for (const sentence of resultSentences) {
      sentences.push({
        ...sentence,
        offsetMs: shiftedOffset(sentence.offsetMs, cursorMs) ?? cursorMs,
        chunkIndex,
        estimated: !result,
      });
    }

    cursorMs += durationMs;
  }

  return {
    words,
    sentences,
    durationMs: cursorMs,
    ready: chunks.length > 0 && chunks.every((chunk) => !!chunk.result),
  };
}
