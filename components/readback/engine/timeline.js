// Pure helpers for Readback's single-track narration timeline.

const MS_PER_WORD = 330;
const SENTENCE_PADDING_MS = 260;
const MIN_READING_MS = 700;
const QUICK_START_WORDS = 180;
const QUICK_START_CHARS = 1400;

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
 * Short readings remain one continuous track. Long readings use exactly two:
 * a quick-start section of roughly one spoken minute and one continuous
 * remainder. Both generate concurrently, so the remainder is normally warm
 * long before the only handoff in the entire article.
 */
export function buildSynthesisChunks(article) {
  const tokens = Array.isArray(article?.tokens) ? article.tokens : [];
  const sentences = Array.isArray(article?.sentences) ? article.sentences : [];
  if (!tokens.some((token) => token.type === 'word')) return [];

  let words = 0;
  let chars = 0;
  let splitAt = -1;
  for (let i = 0; i < sentences.length - 1; i++) {
    const sentence = sentences[i];
    const sentenceTokens = tokens.slice(sentence.tokenStart, sentence.tokenEnd + 1);
    words += sentenceTokens.filter((token) => token.type === 'word').length;
    chars += sentenceTokens.reduce((sum, token) => sum + token.text.length, 0);
    if (words >= QUICK_START_WORDS || chars >= QUICK_START_CHARS) {
      splitAt = i + 1;
      break;
    }
  }

  if (splitAt < 1) return [makeChunk(tokens, sentences)];

  const nextToken = sentences[splitAt].tokenStart;
  return [
    makeChunk(tokens.slice(0, nextToken), sentences.slice(0, splitAt)),
    makeChunk(tokens.slice(nextToken), sentences.slice(splitAt)),
  ];
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
