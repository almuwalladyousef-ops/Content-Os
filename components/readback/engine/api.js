// Thin fetch wrappers. All paths are relative so this ports into Electron cleanly.

async function post(path, body, { timeoutMs } = {}) {
  const ctrl = timeoutMs ? new AbortController() : null;
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl?.signal,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error(`Readback service returned an invalid response (${res.status}).`);
    }
    if (!data || Array.isArray(data) || typeof data !== 'object') {
      throw new Error(`Readback service returned an invalid response (${res.status}).`);
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('That took too long. Try again or pick another voice.');
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getJson(path) {
  const res = await fetch(path);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`Readback service returned an invalid response (${res.status}).`);
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error(`Readback service returned an invalid response (${res.status}).`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  extract: (input) => post('/api/readback/extract', input),
  // The legacy full-document endpoint remains available. New playback uses the
  // sentence endpoint so the first audio is returned without waiting for the
  // rest of the article.
  tts: ({ tokens, sentences, voice }) => post('/api/readback/tts', { tokens, sentences, voice }, { timeoutMs: 180000 }),
  ttsChunk: ({ tokens, sentences, voice }) =>
    post('/api/readback/tts/chunk', { tokens, sentences, voice }, { timeoutMs: 65000 }),
  voices: () => getJson('/api/readback/voices'),
  library: {
    list: () => getJson('/api/readback/library'),
    save: (article) => post('/api/readback/library', article),
    get: (id) => getJson(`/api/readback/library/${id}`),
    patch: (id, changes) =>
      fetch(`/api/readback/library/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      }),
    remove: (id) => fetch(`/api/readback/library/${id}`, { method: 'DELETE' }),
  },
};
