/**
 * Tokenize normalized prose into display tokens + sentence ranges.
 *
 * This is the single source of truth used BOTH to render the reading view and
 * to align TTS word-boundary events. Concatenating every token's `text` exactly
 * reproduces the input, so the reader can render faithfully.
 *
 * Token shape: { i, text, type, word? }
 *   type 'word'  -> a spoken word; `word` is its lowercased form (keeps internal
 *                   apostrophes/hyphens, e.g. "don't", "well-being")
 *   type 'punct' -> a run of punctuation
 *   type 'space' -> spaces/tabs
 *   type 'para'  -> a paragraph break (one or more newlines)
 *
 * Sentence shape: { i, tokenStart, tokenEnd } — inclusive token index range
 * covering one sentence (terminated by . ! ? or a paragraph break).
 */
const TOKEN_RE =
  /([A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*)|(\n+)|([ \t]+)|([^\sA-Za-z0-9]+)/g;

export function toDisplayTokens(text) {
  const tokens = [];
  const sentences = [];
  const src = String(text ?? '');

  let i = 0;
  let m;
  while ((m = TOKEN_RE.exec(src)) !== null) {
    const [, wordTok, paraTok, spaceTok, punctTok] = m;
    if (wordTok !== undefined) {
      tokens.push({ i, text: wordTok, type: 'word', word: wordTok.toLowerCase() });
    } else if (paraTok !== undefined) {
      tokens.push({ i, text: paraTok, type: 'para' });
    } else if (spaceTok !== undefined) {
      tokens.push({ i, text: spaceTok, type: 'space' });
    } else {
      tokens.push({ i, text: punctTok, type: 'punct' });
    }
    i++;
  }

  // Build sentence ranges over the token stream.
  let start = -1; // first content token of the open sentence
  const isContent = (t) => t.type === 'word' || t.type === 'punct';
  const endsSentence = (t) => t.type === 'punct' && /[.!?]/.test(t.text);

  const closeSentence = (end) => {
    if (start === -1) return;
    sentences.push({ i: sentences.length, tokenStart: start, tokenEnd: end });
    start = -1;
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (start === -1 && isContent(t)) start = k;

    if (endsSentence(t)) {
      closeSentence(k);
    } else if (t.type === 'para' && start !== -1) {
      // Paragraph break ends the open sentence at the previous content token.
      let end = k - 1;
      while (end > start && tokens[end].type === 'space') end--;
      closeSentence(end);
    }
  }
  // Flush any trailing sentence without terminal punctuation.
  if (start !== -1) {
    let end = tokens.length - 1;
    while (end > start && tokens[end].type === 'space') end--;
    closeSentence(end);
  }

  return { tokens, sentences };
}
