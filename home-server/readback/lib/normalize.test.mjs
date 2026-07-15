import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForSpeech } from './normalize.js';
import { toDisplayTokens } from './tokenize.js';

test('normalization treats wrapped lines as spaces and keeps blank-line paragraphs', () => {
  assert.equal(
    normalizeForSpeech('This was copied\nfrom a narrow column.\n\nThis is a new paragraph.'),
    'This was copied from a narrow column.\n\nThis is a new paragraph.',
  );
});

test('normalization repairs punctuation spacing while preserving decimals and initials', () => {
  assert.equal(
    normalizeForSpeech('Hello,world.Next sentence. U.S. sales were 3.14 million.'),
    'Hello, world. Next sentence. U.S. sales were 3.14 million.',
  );
});

test('normalization keeps long dashes as audible pauses', () => {
  assert.equal(normalizeForSpeech('Wait—this matters.'), 'Wait — this matters.');
});

test('tokenization recognizes Unicode words instead of treating them as punctuation', () => {
  const { tokens } = toDisplayTokens('Café déjà vu. مرحبا بالعالم.');
  assert.deepEqual(
    tokens.filter((token) => token.type === 'word').map((token) => token.text),
    ['Café', 'déjà', 'vu', 'مرحبا', 'بالعالم'],
  );
});
