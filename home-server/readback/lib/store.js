import {
  readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LIBRARY_DIR } from '../config.js';

const recPath = (id, dir) => join(dir, `${id}.json`);

// Strictly-increasing timestamp so rapid successive saves keep a stable order.
let lastTs = 0;
function nextTimestamp() {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}

function readRec(id, dir) {
  const p = recPath(id, dir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function writeRec(rec, dir) {
  writeFileSync(recPath(rec.id, dir), JSON.stringify(rec));
}

/** Save a new article; returns the full stored record. */
export function saveArticle(article, dir = LIBRARY_DIR) {
  const createdAt = nextTimestamp();
  const id = `${createdAt}-${randomUUID().slice(0, 8)}`;
  const rec = {
    id,
    title: article.title || 'Untitled',
    tokens: article.tokens || [],
    sentences: article.sentences || [],
    voice: article.voice || '',
    audioHash: article.audioHash || '',
    wordCount: article.wordCount || 0,
    durationMs: article.durationMs ?? null,
    createdAt,
    progressMs: Math.max(0, Number(article.progressMs) || 0),
    read: false,
  };
  writeRec(rec, dir);
  return rec;
}

/** Lightweight list (no heavy token arrays), newest first. */
export function listArticles(dir = LIBRARY_DIR) {
  if (!existsSync(dir)) return [];
  const recs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const meta = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      delete meta.tokens;
      delete meta.sentences;
      return meta;
    });
  recs.sort((a, b) => b.createdAt - a.createdAt);
  return recs;
}

/** Full record including tokens/sentences for replay, or null. */
export function getArticle(id, dir = LIBRARY_DIR) {
  return readRec(id, dir);
}

export function updateProgress(id, progressMs, dir = LIBRARY_DIR) {
  const rec = readRec(id, dir);
  if (!rec) return null;
  rec.progressMs = progressMs;
  writeRec(rec, dir);
  return rec;
}

export function markRead(id, read, dir = LIBRARY_DIR) {
  const rec = readRec(id, dir);
  if (!rec) return null;
  rec.read = !!read;
  writeRec(rec, dir);
  return rec;
}

export function deleteArticle(id, dir = LIBRARY_DIR) {
  const p = recPath(id, dir);
  if (existsSync(p)) unlinkSync(p);
}
