import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSynthesisChunks, assembleTimeline } from './timeline.js';
import { toDisplayTokens } from '../../../home-server/readback/lib/tokenize.js';

const tokens = [
  { i: 0, type: 'word', text: 'First' },
  { i: 1, type: 'punct', text: '.' },
  { i: 2, type: 'space', text: ' ' },
  { i: 3, type: 'word', text: 'Second' },
  { i: 4, type: 'space', text: ' ' },
  { i: 5, type: 'word', text: 'sentence' },
  { i: 6, type: 'punct', text: '.' },
];
const sentences = [
  { i: 0, tokenStart: 0, tokenEnd: 1 },
  { i: 1, tokenStart: 3, tokenEnd: 6 },
];

test('buildSynthesisChunks keeps original token indexes per sentence', () => {
  const chunks = buildSynthesisChunks({ tokens, sentences });
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].tokens.map((token) => token.i), [0, 1]);
  assert.deepEqual(chunks[1].tokens.map((token) => token.i), [3, 4, 5, 6]);
  assert.ok(chunks[0].estimatedDurationMs > 0);
});

test('buildSynthesisChunks keeps abbreviations and decimals in one speech chunk', () => {
  const article = toDisplayTokens('Dr. Smith paid 3.14 dollars. This works.');
  const chunks = buildSynthesisChunks(article);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].tokens.map((token) => token.text).join(''), 'Dr. Smith paid 3.14 dollars.');
  assert.equal(chunks[1].tokens.map((token) => token.text).join(''), 'This works.');
});

test('buildSynthesisChunks preserves genuinely short sentences', () => {
  const article = toDisplayTokens('No. Go! This works.');
  const chunks = buildSynthesisChunks(article);
  assert.deepEqual(chunks.map((chunk) => chunk.tokens.map((token) => token.text).join('')), [
    'No.',
    'Go!',
    'This works.',
  ]);
});

test('assembleTimeline exposes estimates before synthesis finishes', () => {
  const chunks = buildSynthesisChunks({ tokens, sentences });
  const timeline = assembleTimeline(chunks);
  assert.equal(timeline.ready, false);
  assert.equal(timeline.words.length, 3);
  assert.equal(timeline.sentences[1].offsetMs, chunks[0].estimatedDurationMs);
  assert.equal(timeline.durationMs, chunks[0].estimatedDurationMs + chunks[1].estimatedDurationMs);
});

test('assembleTimeline shifts real word and sentence timing onto one timeline', () => {
  const chunks = buildSynthesisChunks({ tokens, sentences });
  chunks[0].result = {
    durationMs: 1000,
    words: [{ tokenIndex: 0, text: 'First', offsetMs: 100, durationMs: 300 }],
    sentences: [{ ...sentences[0], offsetMs: 100 }],
  };
  chunks[1].result = {
    durationMs: 1800,
    words: [
      { tokenIndex: 3, text: 'Second', offsetMs: 50, durationMs: 300 },
      { tokenIndex: 5, text: 'sentence', offsetMs: 500, durationMs: 400 },
    ],
    sentences: [{ ...sentences[1], offsetMs: 50 }],
  };

  const timeline = assembleTimeline(chunks);
  assert.equal(timeline.ready, true);
  assert.equal(timeline.durationMs, 2800);
  assert.equal(timeline.words[1].offsetMs, 1050);
  assert.equal(timeline.sentences[1].offsetMs, 1050);
});
