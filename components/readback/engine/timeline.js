// Pure helpers for Readback's incremental sentence pipeline. Keeping timeline
// construction separate from DOM/audio orchestration makes the queue easy to
// reason about and lets the UI expose a useful duration before every sentence
// has finished synthesizing.

const MS_PER_WORD = 330;
const SENTENCE_PADDING_MS = 260;
const MIN_SENTENCE_MS = 700;
const MAX_GROUP_SENTENCES = 3;
const MAX_FIRST_GROUP_SENTENCES = 2;
const MAX_GROUP_CHARS = 420;

function estimateDuration(tokens) {
  const words = tokens.filter((token) => token.type === 'word').length;
  return Math.max(MIN_SENTENCE_MS, words * MS_PER_WORD + SENTENCE_PADDING_MS);
}

const TITLE_ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'mt',
]);
const CONTINUING_ABBREVIATIONS = new Set([
  'vs', 'etc', 'fig', 'no', 'dept', 'inc', 'ltd', 'co', 'approx',
]);

function rangeText(tokens, sentence) {
  return tokens.slice(sentence.tokenStart, sentence.tokenEnd + 1).map((token) => token.text).join('');
}

function spokenWords(tokens, sentence) {
  return tokens
    .slice(sentence.tokenStart, sentence.tokenEnd + 1)
    .filter((token) => token.type === 'word');
}

// Display tokenization intentionally stays simple, but an audio request must
// not stop at the period in "Dr. Smith", "3.14", or an initialism. Merge only
// high-confidence continuations so genuinely short sentences ("Go!", "No.")
// remain independently seekable.
function shouldMergeWithNext(tokens, current, next) {
  const currentText = rangeText(tokens, current).trim();
  if (!currentText.endsWith('.')) return false;

  const words = spokenWords(tokens, current);
  const nextWords = spokenWords(tokens, next);
  const lastWord = words.at(-1)?.text || '';
  const nextWord = nextWords[0]?.text || '';
  if (!lastWord || !nextWord) return false;

  // Decimal numbers are split into "3." + "14 ..." by the display tokenizer.
  if (/^\d+$/.test(lastWord) && /^\d/.test(nextWord)) return true;

  const lower = lastWord.toLowerCase();
  if (TITLE_ABBREVIATIONS.has(lower)) return true;
  if (CONTINUING_ABBREVIATIONS.has(lower) && /^[a-z\d]/.test(nextWord)) return true;
  if (words.length === 1 && /^[A-Z]$/.test(lastWord)) return true;

  // Join the next piece of an initialism ("U." + "S."), and continue common
  // prose abbreviations such as "e.g." when another word follows.
  const nextText = rangeText(tokens, next).trim();
  if (/[A-Za-z]\.$/.test(currentText) && /^[A-Za-z]\.$/.test(nextText)) return true;
  if (/(?:e\.g\.|i\.e\.)$/i.test(currentText)) return true;
  if (/(?:[A-Za-z]\.){2,}$/.test(currentText) && /^[a-z]/.test(nextWord)) return true;

  return false;
}

function speechRanges(tokens, sentences) {
  const ranges = [];
  for (const sentence of sentences) {
    const previous = ranges.at(-1);
    if (previous && shouldMergeWithNext(tokens, previous, sentence)) {
      previous.tokenEnd = sentence.tokenEnd;
      continue;
    }
    ranges.push({ ...sentence });
  }
  return ranges.map((sentence, i) => ({ ...sentence, i }));
}

// Separate audio files add decoder/loading silence on top of the voice's own
// punctuation pause. Keep a small group of sentences in each file so periods
// use the voice's natural cadence, while the first request stays short enough
// to begin quickly.
function readingGroups(tokens, sentences) {
  const ranges = speechRanges(tokens, sentences);
  const groups = [];
  let current = null;

  const flush = () => {
    if (current) groups.push(current);
    current = null;
  };

  for (const sentence of ranges) {
    const limit = groups.length === 0 ? MAX_FIRST_GROUP_SENTENCES : MAX_GROUP_SENTENCES;
    const nextStart = current?.tokenStart ?? sentence.tokenStart;
    const nextText = tokens.slice(nextStart, sentence.tokenEnd + 1).map((token) => token.text).join('');
    if (current && (current.sentences.length >= limit || nextText.length > MAX_GROUP_CHARS)) flush();

    if (!current) {
      current = {
        tokenStart: sentence.tokenStart,
        tokenEnd: sentence.tokenEnd,
        sentences: [{ ...sentence }],
      };
    } else {
      current.tokenEnd = sentence.tokenEnd;
      current.sentences.push({ ...sentence });
    }
  }
  flush();
  return groups;
}

/**
 * Split an extracted article into independently synthesizable sentences while
 * preserving the original token indexes used by the rendered word spans.
 */
export function buildSynthesisChunks(article) {
  const tokens = Array.isArray(article?.tokens) ? article.tokens : [];
  const sentences = Array.isArray(article?.sentences) ? article.sentences : [];

  const chunks = readingGroups(tokens, sentences)
    .map((group) => {
      const chunkTokens = tokens.slice(group.tokenStart, group.tokenEnd + 1);
      return {
        tokens: chunkTokens,
        sentences: group.sentences,
        tokenStart: group.tokenStart,
        tokenEnd: group.tokenEnd,
        estimatedDurationMs: estimateDuration(chunkTokens),
        result: null,
        promise: null,
        error: null,
      };
    })
    // A punctuation-only range has nothing useful for the voice service.
    .filter((chunk) => chunk.tokens.some((token) => token.type === 'word'));

  if (chunks.length) return chunks;
  if (!tokens.some((token) => token.type === 'word')) return [];

  return [{
    tokens,
    sentences,
    tokenStart: tokens[0]?.i ?? 0,
    tokenEnd: tokens[tokens.length - 1]?.i ?? 0,
    estimatedDurationMs: estimateDuration(tokens),
    result: null,
    promise: null,
    error: null,
  }];
}

function shiftedOffset(offsetMs, startMs) {
  return offsetMs == null ? null : offsetMs + startMs;
}

/**
 * Combine ready sentence results with lightweight estimates for pending ones.
 * Estimates make seeking, resume, skip, and click-a-word work immediately; a
 * ready result replaces them with Edge's real word boundaries.
 */
export function assembleTimeline(chunks) {
  const words = [];
  const sentences = [];
  let cursorMs = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const result = chunk.result;
    const durationMs = Math.max(
      1,
      Number(result?.durationMs) || Number(chunk.estimatedDurationMs) || MIN_SENTENCE_MS,
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
