import { api } from './api.js';
import { initTheme } from './theme.js';
import { initInput } from './dropzone.js';
import { renderArticle } from './reader.js';
import { createPlayer } from './player.js';
import { createHighlighter } from './highlight.js';
import { initShortcuts } from './shortcuts.js';
import { renderList, formatTime } from './library.js';
import { buildSynthesisChunks, assembleTimeline } from './timeline.js';

// Wrapped so React can mount it after the markup renders (the original was a
// self-initializing module). All logic below is verbatim from readback's main.js.
export function initReadback() {

const DEFAULT_VOICE = 'en-US-AvaMultilingualNeural';
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const $ = (id) => document.getElementById(id);

const els = {
  topbar: $('topbar'), brand: $('brand'), navLibrary: $('nav-library'),
  themeToggle: $('theme-toggle'),
  viewInput: $('view-input'), viewReader: $('view-reader'), viewLibrary: $('view-library'),
  inputError: $('input-error'), readPaste: $('read-paste'), readUrl: $('read-url'),
  pickFile: $('pick-file'), paste: $('paste'),
  reading: $('reading'), readerTitle: $('reader-title'), readerMeta: $('reader-meta'),
  transport: $('transport'), play: $('play'), skipBack: $('skip-back'), skipFwd: $('skip-fwd'),
  seek: $('seek'), time: $('time'), speed: $('speed'), voice: $('voice'),
  volume: $('volume'),
  save: $('save'), download: $('download'),
  libraryList: $('library-list'), toast: $('toast'), audio: $('audio'),
};

const player = createPlayer(els.audio);
const highlighter = createHighlighter();

const state = {
  article: null,        // { title, tokens, sentences, wordCount, estMinutes }
  tts: null,            // virtual aggregate of ready + estimated sentence timing
  chunks: [],           // independently synthesized sentence tracks
  spanByToken: null,
  voice: DEFAULT_VOICE,
  speed: 1,
  volume: 1,
  libraryId: null,
  synthGen: 0,          // generation token; bumped to supersede stale requests
  backgroundStarted: false,
  backgroundPromise: null,
  foregroundRequests: 0,
  lastSavedMs: 0,
};

// --- Session persistence (survive a page refresh) --------------------------
const SESSION_KEY = 'readback:session';
let lastSessionSave = 0;
function saveSession() {
  if (!state.article) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      article: state.article,
      voice: state.voice,
      speed: state.speed,
      volume: state.volume,
      libraryId: state.libraryId,
      progressMs: player.currentMs || state.lastSavedMs || 0,
    }));
    lastSessionSave = Date.now();
  } catch { /* quota or disabled storage — non-fatal */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// --- View routing ----------------------------------------------------------
function showView(name) {
  els.viewInput.hidden = name !== 'input';
  els.viewReader.hidden = name !== 'reader';
  els.viewLibrary.hidden = name !== 'library';
  els.transport.hidden = name !== 'reader';
  els.navLibrary.textContent = name === 'library' ? 'Close' : 'Library';
}
const readerActive = () => !els.viewReader.hidden;

// --- Toast -----------------------------------------------------------------
let toastTimer = null;
function toast(msg, { sticky = false } = {}) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
}
function hideToast() { clearTimeout(toastTimer); els.toast.hidden = true; }

// --- Synthesis -------------------------------------------------------------
function hashFromUrl(url) {
  return url ? url.split('/').pop().replace('.mp3', '') : '';
}

function setForegroundBusy(delta) {
  state.foregroundRequests = Math.max(0, state.foregroundRequests + delta);
  els.transport.classList.toggle('is-busy', state.foregroundRequests > 0);
}

function refreshTimeline() {
  state.tts = assembleTimeline(state.chunks);
  highlighter.setWords(state.tts.words, state.spanByToken);
  highlighter.update(player.currentMs);
  updateTimeUI(player.currentMs);
  return state.tts;
}

function resetSynthesis(progressMs = 0) {
  state.synthGen++;
  state.backgroundStarted = false;
  state.backgroundPromise = null;
  state.foregroundRequests = 0;
  els.transport.classList.remove('is-busy');
  state.chunks = buildSynthesisChunks(state.article);
  player.setQueue(
    state.chunks.map((chunk) => ({
      url: null,
      durationMs: chunk.estimatedDurationMs,
    })),
    progressMs,
  );
  refreshTimeline();
}

// Fetching the MP3 once its JSON manifest arrives warms the browser cache, so
// moving to the next sentence normally needs no network pause.
function warmAudio(url) {
  fetch(url, { cache: 'force-cache' })
    .then((res) => { if (res.ok) return res.arrayBuffer(); return null; })
    .catch(() => {});
}

function synthesizeChunk(index, { foreground = false, retry = false } = {}) {
  const chunk = state.chunks[index];
  if (!chunk) return Promise.reject(new Error('That part of the reading is unavailable.'));
  if (chunk.result) return Promise.resolve(chunk.result);
  if (chunk.promise) {
    if (!foreground || chunk.foreground) return chunk.promise;
    // Playback caught up with a background request. Promote its existing
    // promise to visible foreground work without starting a duplicate request.
    const foregroundGen = state.synthGen;
    chunk.foreground = true;
    setForegroundBusy(1);
    toast('Preparing next sentence…', { sticky: true });
    return chunk.promise
      .then((res) => { if (foregroundGen === state.synthGen) hideToast(); return res; })
      .catch((err) => {
        if (foregroundGen === state.synthGen) toast(err.message || 'Could not generate audio.');
        throw err;
      })
      .finally(() => {
        if (foregroundGen === state.synthGen && chunk.foreground) {
          chunk.foreground = false;
          setForegroundBusy(-1);
        }
      });
  }
  if (chunk.error && !retry) return Promise.reject(chunk.error);

  const gen = state.synthGen;
  const voice = state.voice;
  chunk.error = null;
  chunk.foreground = foreground;
  if (foreground) {
    setForegroundBusy(1);
    toast('Preparing audio…', { sticky: true });
  }

  chunk.promise = api.ttsChunk({
    tokens: chunk.tokens,
    sentences: chunk.sentences,
    voice,
  })
    .then((res) => {
      if (gen !== state.synthGen) return null;
      chunk.result = res;
      chunk.error = null;
      player.updateTrack(index, {
        url: res.audioUrl,
        durationMs: Number(res.durationMs) || chunk.estimatedDurationMs,
      });
      refreshTimeline();
      if (index !== player.trackIndex) warmAudio(res.audioUrl);
      if (foreground) hideToast();
      return res;
    })
    .catch((err) => {
      if (gen === state.synthGen) {
        chunk.error = err;
        if (foreground) toast(err.message || 'Could not generate audio.');
      }
      throw err;
    })
    .finally(() => {
      if (gen !== state.synthGen) return;
      chunk.promise = null;
      if (foreground && chunk.foreground) {
        chunk.foreground = false;
        setForegroundBusy(-1);
      }
    });

  return chunk.promise;
}

function prioritizedIndexes(from) {
  const indexes = [];
  for (let i = from + 1; i < state.chunks.length; i++) indexes.push(i);
  for (let i = 0; i < from; i++) indexes.push(i);
  return indexes;
}

function startBackground(from = player.trackIndex) {
  if (state.backgroundStarted) return state.backgroundPromise || Promise.resolve();
  state.backgroundStarted = true;
  const gen = state.synthGen;
  const pending = prioritizedIndexes(from);
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length && gen === state.synthGen) {
      const index = pending[cursor++];
      try { await synthesizeChunk(index); } catch { /* retry on demand */ }
    }
  }

  state.backgroundPromise = Promise.all([worker(), worker()]);
  return state.backgroundPromise;
}

function prefetchAhead(from) {
  for (let index = from + 1; index <= Math.min(from + 2, state.chunks.length - 1); index++) {
    synthesizeChunk(index).catch(() => {});
  }
}

function prepareCurrent({ foreground = true } = {}) {
  if (!state.chunks.length) return Promise.reject(new Error('There is no readable text.'));
  const index = player.trackIndex;
  const gen = state.synthGen;
  return synthesizeChunk(index, { foreground, retry: foreground })
    .then((res) => {
      if (gen !== state.synthGen) return res;
      prefetchAhead(index);
      startBackground(index);
      return res;
    });
}

async function ensureAllChunks() {
  if (!state.chunks.length) throw new Error('There is no readable text.');
  const gen = state.synthGen;
  const missing = state.chunks
    .map((chunk, index) => (!chunk.result ? index : -1))
    .filter((index) => index >= 0);
  let cursor = 0;
  let firstError = null;

  async function worker() {
    while (cursor < missing.length && gen === state.synthGen) {
      const index = missing[cursor++];
      try {
        await synthesizeChunk(index, { retry: true });
      } catch {
        // A background request may have failed just as Download adopted it.
        // Retry that sentence once before failing the explicit export.
        try { await synthesizeChunk(index, { retry: true }); }
        catch (err) { if (!firstError) firstError = err; }
      }
    }
  }

  await Promise.all([worker(), worker(), worker()]);
  if (gen !== state.synthGen) throw new Error('The reading changed while audio was being prepared.');
  if (firstError) throw firstError;
  return refreshTimeline();
}

// --- Load an article into the reader ---------------------------------------
function openArticle(article, { libraryId = null, progressMs = 0 } = {}) {
  player.pause();
  state.article = article;
  state.tts = null;
  state.libraryId = libraryId;
  state.lastSavedMs = progressMs;
  highlighter.reset();

  const { spanByToken } = renderArticle(els.reading, article.tokens);
  state.spanByToken = spanByToken;

  els.readerTitle.textContent = article.title || 'Untitled';
  const mins = article.estMinutes || Math.max(1, Math.round(article.wordCount / 200));
  els.readerMeta.textContent = `${article.wordCount} words · ${mins} min`;

  setSpeed(state.speed);
  resetSynthesis(progressMs);
  window.scrollTo({ top: 0 });
  // The reading pane (#view-reader) scrolls internally in the suite shell.
  els.viewReader?.scrollTo({ top: 0 });
  els.reading.closest('main.scroll, .scroll')?.scrollTo({ top: 0 });
  showView('reader');
  saveSession();

  // Prepare only the current sentence eagerly. It can start while upcoming
  // sentences synthesize behind it.
  const gen = state.synthGen;
  prepareAudio().then(() => {
    if (gen !== state.synthGen) return;
    if (progressMs > 0) {
      updateTimeUI(progressMs);
      if (progressMs > 2000) toast('Resumed where you left off');
    }
  });
}

// --- Transport -------------------------------------------------------------
function prepareAudio() {
  return prepareCurrent()
    .catch(() => {});
}

function startPlayback() {
  player.play().catch(() => {});
  prepareCurrent({ foreground: true }).catch(() => {});
}

function togglePlay() {
  if (!state.article) return;
  if (player.paused) startPlayback(); else player.pause();
}

function setPlayingUI(playing) {
  els.play.classList.toggle('playing', playing);
  els.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  els.reading.classList.toggle('is-playing', playing);
}

function effectiveDuration() {
  return player.durationMs || state.tts?.durationMs || 0;
}

function updateTimeUI(ms) {
  const dur = effectiveDuration();
  els.time.textContent = `${formatTime(ms)} / ${formatTime(dur)}`;
  els.seek.value = dur ? String(Math.min(1000, (ms / dur) * 1000)) : '0';
}

function setSpeed(s) {
  state.speed = Math.min(2.5, Math.max(0.5, Math.round(s * 100) / 100));
  player.setRate(state.speed);
  els.speed.textContent = `${state.speed.toFixed(state.speed % 1 === 0 ? 1 : 2)}×`;
}

function setVolume(value) {
  state.volume = Math.min(1, Math.max(0, Number(value) || 0));
  player.setVolume(state.volume);
  els.volume.value = String(Math.round(state.volume * 100));
  els.volume.setAttribute('aria-valuetext', `${Math.round(state.volume * 100)} percent`);
}

function skipSentence(dir) {
  const sents = (state.tts?.sentences || []).filter((s) => s.offsetMs != null);
  if (!sents.length) return;
  const now = player.currentMs;
  let idx = -1;
  for (let i = 0; i < sents.length; i++) { if (sents[i].offsetMs <= now + 1) idx = i; }
  const target = Math.min(sents.length - 1, Math.max(0, idx + dir));
  player.seekMs(sents[target].offsetMs);
}

// --- Progress persistence --------------------------------------------------
function maybeSaveProgress(force = false) {
  const ms = player.currentMs;
  // Library record (server) — only when this article is saved.
  if (state.libraryId && (force || Math.abs(ms - state.lastSavedMs) >= 5000)) {
    state.lastSavedMs = ms;
    api.library.patch(state.libraryId, { progressMs: ms }).catch(() => {});
  }
  // Session (localStorage) — always, so a refresh resumes where you were.
  if (force || Date.now() - lastSessionSave >= 4000) saveSession();
}

// --- Player events ---------------------------------------------------------
player.on('time', (ms) => {
  if (readerActive()) {
    highlighter.update(ms);
    updateTimeUI(ms);
    if (!player.paused) maybeSaveProgress();
  }
});
player.on('state', (playing) => { setPlayingUI(playing); if (!playing) maybeSaveProgress(true); });
player.on('track', (index) => {
  if (state.chunks[index]?.result) prefetchAhead(index);
});
player.on('needtrack', (index) => {
  const gen = state.synthGen;
  synthesizeChunk(index, { foreground: true, retry: true })
    .then(() => { if (gen === state.synthGen) startBackground(index); })
    .catch(() => { if (gen === state.synthGen) player.pause(); });
});
player.on('error', () => {
  toast('Audio could not start. Press play to retry.');
});
player.on('ended', () => {
  maybeSaveProgress(true);
  if (state.libraryId) api.library.patch(state.libraryId, { read: true }).catch(() => {});
});

// --- Library ---------------------------------------------------------------
async function showLibrary() {
  showView('library');
  try {
    const { articles } = await api.library.list();
    renderList(els.libraryList, articles, { onOpen: openFromLibrary, onDelete: deleteFromLibrary });
  } catch (err) {
    toast(err.message || 'Could not load library.');
  }
}

async function openFromLibrary(id) {
  try {
    const rec = await api.library.get(id);
    state.voice = rec.voice || DEFAULT_VOICE;
    els.voice.value = state.voice;
    openArticle(rec, { libraryId: id, progressMs: rec.progressMs || 0 });
  } catch (err) {
    toast(err.message || 'Could not open.');
  }
}

async function deleteFromLibrary(id) {
  await api.library.remove(id);
  if (state.libraryId === id) state.libraryId = null;
  showLibrary();
}

async function saveCurrent() {
  if (!state.article) return;
  try {
    const firstAudioUrl = state.chunks.find((chunk) => chunk.result)?.result?.audioUrl || '';
    const rec = await api.library.save({
      title: state.article.title,
      tokens: state.article.tokens,
      sentences: state.article.sentences,
      voice: state.voice,
      audioHash: hashFromUrl(firstAudioUrl),
      wordCount: state.article.wordCount,
      durationMs: effectiveDuration(),
    });
    state.libraryId = rec.id;
    toast('Saved to library');
  } catch (err) {
    toast(err.message || 'Could not save.');
  }
}

async function downloadMp3() {
  if (!state.article) return;
  els.download.classList.add('is-busy');
  toast('Preparing download…', { sticky: true });
  try {
    await ensureAllChunks();
    const parts = await Promise.all(state.chunks.map(async (chunk) => {
      const response = await fetch(chunk.result.audioUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not download audio (${response.status}).`);
      return response.blob();
    }));
    const objectUrl = URL.createObjectURL(new Blob(parts, { type: 'audio/mpeg' }));
    const a = document.createElement('a');
    a.href = objectUrl;
    const safe = (state.article.title || 'readback').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'readback';
    a.download = `${safe}.mp3`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast('MP3 ready');
  } catch (err) {
    toast(err.message || 'Could not prepare the download.');
  } finally {
    els.download.classList.remove('is-busy');
  }
}

// --- Wiring ----------------------------------------------------------------
function setInputBusy(busy) {
  for (const b of [els.readPaste, els.readUrl, els.pickFile]) b.disabled = busy;
  els.readPaste.textContent = busy ? 'Reading…' : 'Read it';
}

initTheme(els.themeToggle, els.reading?.closest('.readback') || document.querySelector('.readback'));
initInput({
  onArticle: (article) => openArticle(article),
  onError: (msg) => { els.inputError.textContent = msg; },
  setBusy: setInputBusy,
});

// The logo starts a fresh reading: stop, forget the restored session, clear state.
els.brand.addEventListener('click', () => {
  player.pause();
  state.synthGen++;
  player.setQueue([]);
  clearSession();
  state.article = null;
  state.tts = null;
  state.chunks = [];
  state.libraryId = null;
  els.paste.value = '';
  els.inputError.textContent = '';
  showView('input');
});
els.navLibrary.addEventListener('click', () => {
  if (els.viewLibrary.hidden) showLibrary();
  else showView(state.article ? 'reader' : 'input');
});
els.play.addEventListener('click', togglePlay);
els.skipBack.addEventListener('click', () => skipSentence(-1));
els.skipFwd.addEventListener('click', () => skipSentence(1));
els.save.addEventListener('click', saveCurrent);
els.download.addEventListener('click', downloadMp3);

els.seek.addEventListener('input', () => {
  const dur = effectiveDuration();
  if (dur) { player.seekMs((els.seek.value / 1000) * dur); }
});
els.speed.addEventListener('click', () => {
  const i = SPEEDS.indexOf(state.speed);
  setSpeed(SPEEDS[(i + 1) % SPEEDS.length] ?? 1);
});
els.voice.addEventListener('change', () => {
  if (!state.article) { state.voice = els.voice.value; return; }
  const wasPlaying = !player.paused;
  const resumeAt = player.currentMs;
  player.pause();
  state.voice = els.voice.value;
  highlighter.reset();
  resetSynthesis(resumeAt);
  if (wasPlaying) startPlayback();
  else prepareAudio();
  saveSession();
});
els.volume.addEventListener('input', () => {
  setVolume(Number(els.volume.value) / 100);
  saveSession();
});

// Click any word to jump there.
els.reading.addEventListener('click', (e) => {
  const w = e.target.closest('.w');
  if (!w) return;
  const t = highlighter.timeForToken(Number(w.dataset.i));
  if (t != null) {
    player.seekMs(t);
    updateTimeUI(t);
    prepareCurrent({ foreground: true }).catch(() => {});
  }
});

initShortcuts({
  onToggle: togglePlay,
  onSkip: skipSentence,
  onSpeed: (d) => setSpeed(state.speed + d),
  canControl: readerActive,
});

window.addEventListener('scroll', () => {
  els.topbar.classList.toggle('is-stuck', window.scrollY > 4);
}, { passive: true });
// Save your spot when the tab is hidden or closed (covers refresh, close, app switch).
window.addEventListener('beforeunload', () => maybeSaveProgress(true));
window.addEventListener('pagehide', () => maybeSaveProgress(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) maybeSaveProgress(true); });

// A short, curated set of the most natural voices — no need for the full 322.
const VOICES = [
  { shortName: 'en-US-AvaMultilingualNeural', name: 'Ava — warm (US)' },
  { shortName: 'en-US-AndrewMultilingualNeural', name: 'Andrew — calm (US)' },
  { shortName: 'en-US-EmmaMultilingualNeural', name: 'Emma — bright (US)' },
  { shortName: 'en-US-BrianMultilingualNeural', name: 'Brian — easy (US)' },
  { shortName: 'en-GB-SoniaNeural', name: 'Sonia (UK)' },
  { shortName: 'en-AU-NatashaNeural', name: 'Natasha (AU)' },
];
(function populateVoices() {
  els.voice.textContent = '';
  for (const v of VOICES) {
    const opt = document.createElement('option');
    opt.value = v.shortName;
    opt.textContent = v.name;
    els.voice.appendChild(opt);
  }
  els.voice.value = state.voice;
})();

// Restore the last reading so a page refresh resumes where you left off.
(function restoreSession() {
  const sess = loadSession();
  if (!sess || !sess.article) {
    setVolume(1);
    return;
  }
  state.voice = sess.voice || DEFAULT_VOICE;
  state.speed = Number(sess.speed) || 1;
  setVolume(sess.volume == null ? 1 : Number(sess.volume));
  openArticle(sess.article, { libraryId: sess.libraryId || null, progressMs: sess.progressMs || 0 });
})();

}
