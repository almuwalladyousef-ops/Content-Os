import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getArticle, saveArticle } from './store.js';

test('explicit library saves preserve the current reading position', () => {
  const dir = mkdtempSync(join(tmpdir(), 'readback-library-'));
  try {
    const saved = saveArticle({ title: 'Saved reading', progressMs: 4321 }, dir);
    assert.equal(saved.progressMs, 4321);
    assert.equal(getArticle(saved.id, dir).progressMs, 4321);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
