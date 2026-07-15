import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBoundaries, resolveVoice } from './synthesize.js';

test('legacy Edge voices migrate to free local Mac voices', () => {
  assert.equal(resolveVoice('en-US-AvaMultilingualNeural'), 'Reed (English (US))');
  assert.equal(resolveVoice('unknown-voice'), 'Reed (English (US))');
});

test('estimated boundaries include every Unicode word and punctuation pause', () => {
  const boundaries = estimateBoundaries('Hello, world. Café continues.', 5000);
  assert.deepEqual(boundaries.map((item) => item.word), ['Hello', 'world', 'Café', 'continues']);
  assert.ok(boundaries[2].offsetMs > boundaries[1].offsetMs + boundaries[1].durationMs);
});
