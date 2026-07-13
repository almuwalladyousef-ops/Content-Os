/**
 * Align TTS word-boundary events to the display tokens the reader renders.
 *
 * Both sequences are derived from the same normalized text and run in the same
 * order, so we walk the word-type tokens and attach boundaries positionally.
 * Tolerant by design: if boundaries run out, trailing word tokens are left
 * untimed (offsetMs:null) and the highlighter falls back to a neighbor.
 *
 * @returns Array<{ tokenIndex, text, offsetMs, durationMs }> — one per word token.
 */
export function alignBoundariesToTokens(tokens, boundaries) {
  const words = [];
  let bi = 0;
  for (const tok of tokens) {
    if (tok.type !== 'word') continue;
    const b = boundaries[bi];
    if (b) {
      words.push({
        tokenIndex: tok.i,
        text: tok.text,
        offsetMs: b.offsetMs,
        durationMs: b.durationMs,
      });
      bi++;
    } else {
      words.push({ tokenIndex: tok.i, text: tok.text, offsetMs: null, durationMs: null });
    }
  }
  return words;
}

/** Give each sentence the offset of its first timed word (for skip/seek). */
export function attachSentenceTimings(sentences, words) {
  const byToken = new Map(words.map((word) => [word.tokenIndex, word]));
  return sentences.map((sentence) => {
    let offsetMs = null;
    for (let token = sentence.tokenStart; token <= sentence.tokenEnd; token++) {
      const word = byToken.get(token);
      if (word?.offsetMs != null) { offsetMs = word.offsetMs; break; }
    }
    return { ...sentence, offsetMs };
  });
}

/**
 * Rebind cached timings by spoken-word order to this request's token indexes.
 * The cache key is text + voice, so the same sentence can correctly be reused
 * at multiple positions in one article.
 */
export function remapCachedPayload(tokens, sentences, cached, voice) {
  const boundaries = (cached?.words || []).map((word) => ({
    word: word.text,
    offsetMs: word.offsetMs,
    durationMs: word.durationMs,
  }));
  const words = alignBoundariesToTokens(tokens, boundaries);
  return {
    words,
    sentences: attachSentenceTimings(sentences, words),
    durationMs: cached?.durationMs || 0,
    voice: cached?.voice || voice,
  };
}
