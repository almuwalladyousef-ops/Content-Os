import test from 'node:test';
import assert from 'node:assert/strict';
import { remapCachedPayload } from './align.js';

test('cached sentence timing is rebound to the current token indexes', () => {
  const cached = {
    words: [
      { tokenIndex: 0, text: 'Repeat', offsetMs: 120, durationMs: 240 },
      { tokenIndex: 2, text: 'me', offsetMs: 420, durationMs: 180 },
    ],
    sentences: [{ i: 0, tokenStart: 0, tokenEnd: 3, offsetMs: 120 }],
    durationMs: 900,
    voice: 'test-voice',
  };
  const tokens = [
    { i: 20, type: 'word', text: 'Repeat' },
    { i: 21, type: 'space', text: ' ' },
    { i: 22, type: 'word', text: 'me' },
    { i: 23, type: 'punct', text: '.' },
  ];
  const sentences = [{ i: 7, tokenStart: 20, tokenEnd: 23 }];

  const remapped = remapCachedPayload(tokens, sentences, cached, 'test-voice');
  assert.deepEqual(remapped.words.map((word) => word.tokenIndex), [20, 22]);
  assert.equal(remapped.sentences[0].i, 7);
  assert.equal(remapped.sentences[0].offsetMs, 120);
});

