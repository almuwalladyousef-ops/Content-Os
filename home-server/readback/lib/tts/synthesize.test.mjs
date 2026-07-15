import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBoundaries, resolveVoice, splitSegments } from './synthesize.js';

test('legacy Edge and macOS voices migrate to local Kokoro voices', () => {
  assert.equal(resolveVoice('en-US-AvaMultilingualNeural'), 'af_heart');
  assert.equal(resolveVoice('Reed (English (US))'), 'am_michael');
  assert.equal(resolveVoice('Daniel'), 'bm_george');
  assert.equal(resolveVoice('af_bella'), 'af_bella');
  assert.equal(resolveVoice('unknown-voice'), 'af_heart');
});

test('estimated boundaries include every Unicode word and punctuation pause', () => {
  const boundaries = estimateBoundaries('Hello, world. Café continues.', 5000);
  assert.deepEqual(boundaries.map((item) => item.word), ['Hello', 'world', 'Café', 'continues']);
  assert.ok(boundaries[2].offsetMs > boundaries[1].offsetMs + boundaries[1].durationMs);
});

test('segments partition the text exactly and stay under the size cap', () => {
  const sentence = 'The quick brown fox jumps over the lazy dog near the riverbank today. ';
  const text = sentence.repeat(30);
  const segments = splitSegments(text);
  assert.ok(segments.length > 1);
  assert.equal(segments.map((segment) => segment.text).join(''), text);
  for (const segment of segments) assert.ok(segment.text.length <= 400);
});

test('paragraph breaks get longer pauses than sentence gaps', () => {
  const filler = 'Words fill this sentence to reach the segment cap for the test. '.repeat(7);
  const text = `${filler.trim()}\n\n${filler.trim()}`;
  const segments = splitSegments(text);
  assert.ok(segments.length >= 2);
  const paragraphEnd = segments.find((segment) => /\n$|\.$/.test(segment.text) && segment.pauseMs === 260);
  assert.ok(paragraphEnd, 'expected a 260ms paragraph pause');
  assert.equal(segments[segments.length - 1].pauseMs, 0);
});

test('very long unpunctuated text is hard-split at whitespace', () => {
  const text = 'word '.repeat(300).trim();
  const segments = splitSegments(text);
  assert.ok(segments.length > 1);
  assert.equal(segments.map((segment) => segment.text).join(''), text);
  for (const segment of segments) {
    assert.ok(segment.text.length <= 400);
    assert.ok(!/\bwor$|^d\b/.test(segment.text.slice(0, 2)), 'must not split inside a word');
  }
});
