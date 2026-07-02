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
