import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHtml, htmlToSpeakableText } from './html.js';

test('HTML extraction inserts spaces between adjacent inline words', () => {
  assert.equal(
    htmlToSpeakableText('<p>This <strong>article</strong><span>keeps</span> words readable.</p>'),
    'This article keeps words readable.',
  );
});

test('HTML extraction preserves contractions split across inline elements', () => {
  assert.equal(htmlToSpeakableText("<p>It can<em>'</em>t break this.</p>"), "It can't break this.");
});

test('Readability output uses structured HTML instead of smashed textContent', () => {
  const result = extractHtml(`
    <html><head><title>Example</title></head><body><article>
      <h1>Example story</h1>
      <p>This is enough article text to parse correctly.</p>
      <p>Neighboring <strong>inline</strong><span>elements</span> stay separated.</p>
    </article></body></html>
  `);
  assert.match(result.text, /inline elements/);
});
