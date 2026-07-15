import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSynthesisChunks, assembleTimeline } from './timeline.js';
import { toDisplayTokens } from '../../../home-server/readback/lib/tokenize.js';

test('buildSynthesisChunks keeps the full reading and token indexes in one track', () => {
  const article = toDisplayTokens('First. Second sentence. Third.');
  const chunks = buildSynthesisChunks(article);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].tokens.map((token) => token.i), article.tokens.map((token) => token.i));
  assert.deepEqual(chunks[0].sentences.map((sentence) => sentence.i), [0, 1, 2]);
  assert.ok(chunks[0].estimatedDurationMs > 0);
});

test('short readings never create a transition', () => {
  const article = toDisplayTokens('One. Two. Three. Four. Five.');
  const chunks = buildSynthesisChunks(article);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].sentences.length, 5);
  assert.equal(chunks[0].tokens.map((token) => token.text).join(''), article.tokens.map((token) => token.text).join(''));
});

test('long readings use only a quick-start track and one continuous remainder', () => {
  const sentence = 'Clear narration keeps every word understandable and every sentence moving naturally.';
  const article = toDisplayTokens(Array.from({ length: 80 }, () => sentence).join(' '));
  const chunks = buildSynthesisChunks(article);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].tokens.filter((token) => token.type === 'word').length >= 180);
  assert.equal(chunks.flatMap((chunk) => chunk.sentences).length, article.sentences.length);
  assert.equal(
    chunks.flatMap((chunk) => chunk.tokens).filter((token) => token.type === 'word').length,
    article.tokens.filter((token) => token.type === 'word').length,
  );
});

test('assembleTimeline exposes estimates before local synthesis finishes', () => {
  const chunks = buildSynthesisChunks(toDisplayTokens('First. Second sentence.'));
  const timeline = assembleTimeline(chunks);
  assert.equal(timeline.ready, false);
  assert.equal(timeline.words.length, 3);
  assert.equal(timeline.sentences[0].offsetMs, 0);
  assert.equal(timeline.durationMs, chunks[0].estimatedDurationMs);
});

test('assembleTimeline uses the continuous track real timing', () => {
  const chunks = buildSynthesisChunks(toDisplayTokens('First. Second sentence.'));
  chunks[0].result = {
    durationMs: 1800,
    words: [
      { tokenIndex: 0, text: 'First', offsetMs: 100, durationMs: 300 },
      { tokenIndex: 3, text: 'Second', offsetMs: 900, durationMs: 300 },
    ],
    sentences: chunks[0].sentences.map((sentence, index) => ({ ...sentence, offsetMs: 100 + index * 800 })),
  };

  const timeline = assembleTimeline(chunks);
  assert.equal(timeline.ready, true);
  assert.equal(timeline.durationMs, 1800);
  assert.equal(timeline.words[1].offsetMs, 900);
  assert.equal(timeline.sentences[1].offsetMs, 900);
});
