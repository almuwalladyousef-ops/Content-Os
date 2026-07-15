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

test('buildSynthesisChunks groups nearby sentences without losing token indexes', () => {
  const chunks = buildSynthesisChunks({ tokens, sentences });
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].tokens.map((token) => token.i), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(chunks[0].sentences.map((sentence) => sentence.i), [0, 1]);
  assert.ok(chunks[0].estimatedDurationMs > 0);
});

test('buildSynthesisChunks keeps abbreviations and decimals in one speech chunk', () => {
  const article = toDisplayTokens('Dr. Smith paid 3.14 dollars. This works.');
  const chunks = buildSynthesisChunks(article);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].tokens.map((token) => token.text).join(''), 'Dr. Smith paid 3.14 dollars. This works.');
  assert.equal(chunks[0].sentences.length, 2);
});

test('buildSynthesisChunks lets the voice read short sentences in one natural group', () => {
  const article = toDisplayTokens('No. Go! This works.');
  const chunks = buildSynthesisChunks(article);
  assert.deepEqual(chunks.map((chunk) => chunk.tokens.map((token) => token.text).join('')), ['No. Go!', 'This works.']);
});

test('buildSynthesisChunks keeps the first group small for quick playback', () => {
  const article = toDisplayTokens('One. Two. Three. Four. Five.');
  const chunks = buildSynthesisChunks(article);
  assert.deepEqual(chunks.map((chunk) => chunk.sentences.length), [2, 3]);
});

test('buildSynthesisChunks makes larger following blocks to reduce playback gaps', () => {
  const article = toDisplayTokens(
    'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve. Thirteen. Fourteen.',
  );
  const chunks = buildSynthesisChunks(article);
  assert.deepEqual(chunks.map((chunk) => chunk.sentences.length), [2, 10, 2]);
});

test('assembleTimeline exposes estimates before synthesis finishes', () => {
  const chunks = buildSynthesisChunks({ tokens, sentences });
  const timeline = assembleTimeline(chunks);
  assert.equal(timeline.ready, false);
  assert.equal(timeline.words.length, 3);
  assert.equal(timeline.sentences[1].offsetMs, 0);
  assert.equal(timeline.durationMs, chunks[0].estimatedDurationMs);
});

test('assembleTimeline shifts real word and sentence timing onto one timeline', () => {
  const chunks = buildSynthesisChunks(toDisplayTokens('First. Second sentence. Third.'));
  chunks[0].result = {
    durationMs: 1000,
    words: [{ tokenIndex: 0, text: 'First', offsetMs: 100, durationMs: 300 }],
    sentences: chunks[0].sentences.map((sentence, index) => ({ ...sentence, offsetMs: 100 + index * 400 })),
  };
  chunks[1].result = {
    durationMs: 1800,
    words: [{ tokenIndex: chunks[1].tokenStart, text: 'Third', offsetMs: 50, durationMs: 300 }],
    sentences: [{ ...chunks[1].sentences[0], offsetMs: 50 }],
  };

  const timeline = assembleTimeline(chunks);
  assert.equal(timeline.ready, true);
  assert.equal(timeline.durationMs, 2800);
  assert.equal(timeline.words[1].offsetMs, 1050);
  assert.equal(timeline.sentences[2].offsetMs, 1050);
});
