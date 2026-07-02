// Wraps the <audio> element. Emits a smooth time signal via requestAnimationFrame
// while playing (timeupdate alone is too coarse for word-accurate karaoke).

export function createPlayer(audio) {
  const listeners = { time: [], state: [], ended: [] };
  const emit = (name, ...a) => listeners[name].forEach((fn) => fn(...a));

  let rafId = null;
  const tick = () => {
    emit('time', audio.currentTime * 1000);
    rafId = requestAnimationFrame(tick);
  };
  const startLoop = () => { if (rafId == null) tick(); };
  const stopLoop = () => { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } };

  audio.addEventListener('play', () => { startLoop(); emit('state', true); });
  audio.addEventListener('pause', () => { stopLoop(); emit('time', audio.currentTime * 1000); emit('state', false); });
  audio.addEventListener('ended', () => { stopLoop(); emit('state', false); emit('ended'); });
  audio.addEventListener('seeked', () => emit('time', audio.currentTime * 1000));
  audio.addEventListener('timeupdate', () => { if (rafId == null) emit('time', audio.currentTime * 1000); });

  return {
    on: (name, fn) => { listeners[name]?.push(fn); },
    load(url) { audio.src = url; audio.load(); },
    play: () => audio.play(),
    pause: () => audio.pause(),
    toggle() { audio.paused ? audio.play() : audio.pause(); },
    get paused() { return audio.paused; },
    get durationMs() { return (audio.duration || 0) * 1000; },
    get currentMs() { return audio.currentTime * 1000; },
    seekMs(ms) {
      const d = audio.duration || 0;
      audio.currentTime = Math.min(Math.max(ms / 1000, 0), d || ms / 1000);
    },
    setRate(r) { audio.playbackRate = r; },
    get rate() { return audio.playbackRate; },
  };
}
