import { api } from './api.js';
import { initTheme } from './theme.js';
import { initInput } from './dropzone.js';
import { renderArticle } from './reader.js';
import { createPlayer } from './player.js';
import { createHighlighter } from './highlight.js';
import { initShortcuts } from './shortcuts.js';
import { renderList, formatTime } from './library.js';

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
  save: $('save'), download: $('download'),
  libraryList: $('library-list'), toast: $('toast'), audio: $('audio'),
};

const player = createPlayer(els.audio);
const highlighter = createHighlighter();

const state = {
  article: null,        // { title, tokens, sentences, wordCount, estMinutes }
  tts: null,            // { audioUrl, words, sentences, durationMs, voice }
  spanByToken: null,
  voice: DEFAULT_VOICE,
  speed: 1,
  libraryId: null,
  synthing: null,       // in-flight synth promise
  synthVoice: null,     // voice the in-flight synth is for
  synthGen: 0,          // generation token; bumped to supersede stale synths
  pendingPlay: false,   // user pressed play before audio was ready
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
  return url.split('/').pop().replace('.mp3', '');
}

function ensureSynth() {
  if (state.tts) return Promise.resolve(state.tts);
  // Reuse an in-flight synth only if it's for the SAME voice; a voice change
  // must supersede it (otherwise the old request blocks the new one forever).
  if (state.synthing && state.synthVoice === state.voice) return state.synthing;

  const gen = ++state.synthGen;
  const voice = state.voice;
  state.synthVoice = voice;
  els.transport.classList.add('is-busy');
  toast('Generating audio…', { sticky: true });

  state.synthing = api.tts({
    tokens: state.article.tokens,
    sentences: state.article.sentences,
    voice,
  })
    .then((res) => {
      if (gen !== state.synthGen) return state.tts; // superseded — ignore stale result
      state.tts = res;
      player.load(res.audioUrl);
      highlighter.setWords(res.words, state.spanByToken);
      hideToast();
      return res;
    })
    .catch((err) => {
      if (gen === state.synthGen) toast(err.message || 'Could not generate audio.');
      throw err;
    })
    .finally(() => {
      if (gen === state.synthGen) { els.transport.classList.remove('is-busy'); state.synthing = null; }
    });
  return state.synthing;
}

// --- Load an article into the reader ---------------------------------------
function openArticle(article, { libraryId = null, progressMs = 0 } = {}) {
  state.article = article;
  state.tts = null;
  state.libraryId = libraryId;
  state.pendingPlay = false;
  state.lastSavedMs = progressMs;
  highlighter.reset();

  const { spanByToken } = renderArticle(els.reading, article.tokens);
  state.spanByToken = spanByToken;

  els.readerTitle.textContent = article.title || 'Untitled';
  const mins = article.estMinutes || Math.max(1, Math.round(article.wordCount / 200));
  els.readerMeta.textContent = `${article.wordCount} words · ${mins} min`;

  setSpeed(state.speed);
  updateTimeUI(progressMs);
  setPlayingUI(false);
  window.scrollTo({ top: 0 });
  // The suite shell scrolls <main class="scroll">, not the window.
  els.reading.closest('main.scroll, .scroll')?.scrollTo({ top: 0 });
  showView('reader');
  saveSession();

  // Prepare audio eagerly so the first press of Play can start synchronously
  // (browsers — Safari especially — block play() that follows an awaited fetch).
  prepareAudio().then(() => {
    if (progressMs > 0) {
      player.seekMs(progressMs);
      updateTimeUI(progressMs);
      if (progressMs > 2000) toast('Resumed where you left off');
    }
  });
}

// --- Transport -------------------------------------------------------------
function prepareAudio() {
  return ensureSynth()
    .then((res) => {
      if (state.pendingPlay) { state.pendingPlay = false; startPlayback(); }
      return res;
    })
    .catch(() => {});
}

function startPlayback() {
  player.play().catch(() => toast('Press play to start the audio.'));
}

// Called directly from the click — keep play() in the user-gesture call stack.
function togglePlay() {
  if (!state.article) return;
  if (state.tts) {
    if (player.paused) startPlayback(); else player.pause();
    return;
  }
  // Not synthesized yet: remember the intent; prepareAudio() will start it.
  state.pendingPlay = true;
  prepareAudio();
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
    const res = await ensureSynth();
    const rec = await api.library.save({
      title: state.article.title,
      tokens: state.article.tokens,
      sentences: state.article.sentences,
      voice: state.voice,
      audioHash: hashFromUrl(res.audioUrl),
      wordCount: state.article.wordCount,
      durationMs: res.durationMs,
    });
    state.libraryId = rec.id;
    toast('Saved to library');
  } catch (err) {
    toast(err.message || 'Could not save.');
  }
}

async function downloadMp3() {
  if (!state.article) return;
  try {
    const res = await ensureSynth();
    const a = document.createElement('a');
    a.href = res.audioUrl;
    const safe = (state.article.title || 'readback').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'readback';
    a.download = `${safe}.mp3`;
    document.body.appendChild(a); a.click(); a.remove();
  } catch { /* toast already shown */ }
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
  clearSession();
  state.article = null;
  state.tts = null;
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
  state.voice = els.voice.value;
  const wasPlaying = !player.paused;
  const resumeAt = player.currentMs; // keep the listener's place across the switch
  player.pause();
  state.tts = null;
  highlighter.reset();
  ensureSynth()
    .then(() => {
      if (resumeAt > 0) { player.seekMs(resumeAt); updateTimeUI(resumeAt); }
      if (wasPlaying) startPlayback();
    })
    .catch(() => {});
});

// Click any word to jump there.
els.reading.addEventListener('click', async (e) => {
  const w = e.target.closest('.w');
  if (!w) return;
  try { await ensureSynth(); } catch { return; }
  const t = highlighter.timeForToken(Number(w.dataset.i));
  if (t != null) { player.seekMs(t); updateTimeUI(t); }
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
  if (!sess || !sess.article) return;
  state.voice = sess.voice || DEFAULT_VOICE;
  openArticle(sess.article, { libraryId: sess.libraryId || null, progressMs: sess.progressMs || 0 });
})();

}
