import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { createPlayer } = await import('./player.js');

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.currentTime = 0;
    this.duration = 10;
    this.playbackRate = 1;
    this.preload = '';
    this.playCalls = 0;
    this.attrs = new Map();
  }

  set src(value) { this.attrs.set('src', value); }
  get src() { return this.attrs.get('src') || ''; }
  getAttribute(name) { return this.attrs.get(name) || null; }
  removeAttribute(name) { this.attrs.delete(name); }
  load() {}
  play() {
    this.playCalls++;
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  finish() {
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }
}

test('playlist waits for a missing next sentence then resumes automatically', async () => {
  const audio = new FakeAudio();
  const player = createPlayer(audio);
  const needed = [];
  player.on('needtrack', (index) => needed.push(index));
  player.setQueue([
    { url: '/first.mp3', durationMs: 1000 },
    { url: null, durationMs: 2000 },
  ]);

  await player.play();
  assert.equal(audio.playCalls, 1);
  audio.finish();
  assert.equal(player.trackIndex, 1);
  assert.equal(player.paused, false);
  assert.ok(needed.includes(1));

  player.updateTrack(1, { url: '/second.mp3', durationMs: 1800 });
  await Promise.resolve();
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.getAttribute('src'), '/second.mp3');
});

test('seek maps a global time into the correct sentence track', () => {
  const audio = new FakeAudio();
  const player = createPlayer(audio);
  player.setQueue([
    { url: '/first.mp3', durationMs: 1000 },
    { url: '/second.mp3', durationMs: 2000 },
  ]);

  player.seekMs(2500);
  assert.equal(player.trackIndex, 1);
  assert.equal(audio.currentTime, 1.5);
  assert.equal(player.currentMs, 2500);
  assert.equal(player.durationMs, 3000);
});

test('playback speed survives sentence changes', async () => {
  const audio = new FakeAudio();
  const player = createPlayer(audio);
  player.setQueue([
    { url: '/first.mp3', durationMs: 1000 },
    { url: '/second.mp3', durationMs: 1000 },
  ]);
  player.setRate(1.75);
  await player.play();
  audio.finish();
  assert.equal(audio.playbackRate, 1.75);
});

