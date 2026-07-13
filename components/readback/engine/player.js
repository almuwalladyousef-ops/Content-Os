// Wraps the <audio> element as a virtual, seekable sentence playlist. The
// current sentence can play as soon as its URL is ready while later sentences
// are still being generated. Callers see one continuous millisecond timeline.

export function createPlayer(audio) {
  const listeners = { time: [], state: [], ended: [], track: [], needtrack: [], error: [] };
  const emit = (name, ...a) => listeners[name].forEach((fn) => fn(...a));

  let tracks = [];
  let trackIndex = 0;
  let loadedTrack = -1;
  let pendingLocalMs = 0;
  let desiredPlaying = false;
  let emittedPlaying = false;
  let rate = 1;
  let rafId = null;

  const durationOf = (track, index) => {
    const declared = Number(track?.durationMs) || Number(track?.estimatedDurationMs) || 0;
    if (declared > 0) return declared;
    if (index === loadedTrack && Number.isFinite(audio.duration)) return audio.duration * 1000;
    return 0;
  };
  const startOf = (index) => {
    let ms = 0;
    for (let i = 0; i < index; i++) ms += durationOf(tracks[i], i);
    return ms;
  };
  const totalDuration = () => tracks.reduce((sum, track, index) => sum + durationOf(track, index), 0);
  const localMs = () => loadedTrack === trackIndex ? audio.currentTime * 1000 : pendingLocalMs;
  const globalMs = () => startOf(trackIndex) + localMs();
  const setState = (playing) => {
    if (emittedPlaying === playing) return;
    emittedPlaying = playing;
    emit('state', playing);
  };

  const tick = () => {
    emit('time', globalMs());
    rafId = requestAnimationFrame(tick);
  };
  const startLoop = () => { if (rafId == null) tick(); };
  const stopLoop = () => { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } };

  const applyPendingSeek = () => {
    if (loadedTrack !== trackIndex) return;
    try {
      const max = Number.isFinite(audio.duration) ? audio.duration * 1000 : pendingLocalMs;
      audio.currentTime = Math.min(Math.max(pendingLocalMs, 0), max) / 1000;
    } catch { /* metadata is not ready yet; loadedmetadata will retry */ }
  };

  const tryPlay = () => {
    if (!desiredPlaying || loadedTrack !== trackIndex || !tracks[trackIndex]?.url) {
      if (desiredPlaying) emit('needtrack', trackIndex);
      return Promise.resolve();
    }
    const promise = audio.play();
    if (promise?.catch) {
      promise.catch((err) => {
        if (!desiredPlaying) return;
        desiredPlaying = false;
        stopLoop();
        setState(false);
        emit('error', err);
      });
    }
    return promise || Promise.resolve();
  };

  const loadTrack = (index, local = 0) => {
    const previousTrack = trackIndex;
    trackIndex = Math.min(Math.max(index, 0), Math.max(0, tracks.length - 1));
    pendingLocalMs = Math.max(0, local);
    const track = tracks[trackIndex];
    if (trackIndex !== previousTrack) emit('track', trackIndex);

    if (!track?.url) {
      if (!audio.paused) audio.pause();
      loadedTrack = -1;
      audio.removeAttribute('src');
      audio.load();
      emit('time', globalMs());
      if (desiredPlaying) emit('needtrack', trackIndex);
      return;
    }

    if (loadedTrack !== trackIndex || audio.getAttribute('src') !== track.url) {
      if (!audio.paused) audio.pause();
      loadedTrack = trackIndex;
      audio.src = track.url;
      audio.preload = 'auto';
      audio.load();
    }
    audio.playbackRate = rate;
    applyPendingSeek();
    emit('time', globalMs());
    if (desiredPlaying) tryPlay();
  };

  audio.addEventListener('loadedmetadata', () => {
    applyPendingSeek();
    emit('time', globalMs());
  });
  audio.addEventListener('play', () => {
    desiredPlaying = true;
    startLoop();
    setState(true);
  });
  audio.addEventListener('pause', () => {
    stopLoop();
    emit('time', globalMs());
    if (!desiredPlaying) setState(false);
  });
  audio.addEventListener('ended', () => {
    stopLoop();
    pendingLocalMs = 0;
    if (trackIndex + 1 < tracks.length) {
      loadTrack(trackIndex + 1, 0);
      return;
    }
    desiredPlaying = false;
    setState(false);
    emit('ended');
  });
  audio.addEventListener('seeked', () => emit('time', globalMs()));
  audio.addEventListener('timeupdate', () => { if (rafId == null) emit('time', globalMs()); });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    desiredPlaying = false;
    stopLoop();
    setState(false);
    emit('error', audio.error || new Error('Could not load audio.'));
  });

  return {
    on: (name, fn) => { listeners[name]?.push(fn); },
    setQueue(nextTracks, startMs = 0) {
      desiredPlaying = false;
      stopLoop();
      if (!audio.paused) audio.pause();
      tracks = (nextTracks || []).map((track) => ({ ...track }));
      trackIndex = 0;
      loadedTrack = -1;
      pendingLocalMs = 0;
      audio.removeAttribute('src');
      audio.load();
      setState(false);
      if (tracks.length) this.seekMs(startMs);
      else emit('time', 0);
    },
    updateTrack(index, changes) {
      if (!tracks[index]) return;
      tracks[index] = { ...tracks[index], ...changes };
      if (index === trackIndex && tracks[index].url && loadedTrack !== index) {
        loadTrack(index, pendingLocalMs);
      } else {
        emit('time', globalMs());
      }
    },
    load(url) {
      this.setQueue([{ url, durationMs: 0 }]);
      loadTrack(0, 0);
    },
    play() {
      desiredPlaying = true;
      setState(true);
      if (loadedTrack !== trackIndex) loadTrack(trackIndex, pendingLocalMs);
      return tryPlay();
    },
    pause() {
      desiredPlaying = false;
      stopLoop();
      if (!audio.paused) audio.pause();
      setState(false);
    },
    toggle() { return desiredPlaying ? this.pause() : this.play(); },
    get paused() { return !desiredPlaying; },
    get durationMs() { return totalDuration(); },
    get currentMs() { return globalMs(); },
    get trackIndex() { return trackIndex; },
    seekMs(ms) {
      if (!tracks.length) return;
      const total = totalDuration();
      let remaining = Math.min(Math.max(Number(ms) || 0, 0), total || Number(ms) || 0);
      let index = tracks.length - 1;
      for (let i = 0; i < tracks.length; i++) {
        const duration = durationOf(tracks[i], i);
        if (remaining < duration || i === tracks.length - 1) { index = i; break; }
        remaining -= duration;
      }
      loadTrack(index, remaining);
    },
    setRate(r) { rate = r; audio.playbackRate = r; },
    get rate() { return rate; },
  };
}
