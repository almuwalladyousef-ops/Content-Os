// Input intake: paste box, file picker, drag-and-drop, and URL fetch.
// Each path resolves to an extracted article handed to `onArticle`.
import { api } from './api.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(file);
  });
}

export function initInput({ onArticle, onError, setBusy }) {
  const composer = document.getElementById('composer');
  const paste = document.getElementById('paste');
  const readPaste = document.getElementById('read-paste');
  const pickFile = document.getElementById('pick-file');
  const fileInput = document.getElementById('file-input');
  const url = document.getElementById('url');
  const readUrl = document.getElementById('read-url');

  const run = async (fn) => {
    onError('');
    setBusy(true);
    try {
      const article = await fn();
      onArticle(article);
    } catch (err) {
      onError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  readPaste.addEventListener('click', () => {
    const content = paste.value.trim();
    if (!content) return onError('Paste some text first.');
    run(() => api.extract({ type: 'text', content }));
  });

  const handleFile = (file) => {
    if (!file) return;
    run(async () => {
      const base64 = await fileToBase64(file);
      return api.extract({ type: 'file', filename: file.name, base64 });
    });
  };

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  readUrl.addEventListener('click', () => {
    const link = url.value.trim();
    if (!link) return onError('Paste a link first.');
    run(() => api.extract({ type: 'url', url: link }));
  });
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') readUrl.click(); });

  // Drag and drop onto the composer.
  let depth = 0;
  const setDrag = (on) => composer.classList.toggle('is-drag', on);
  composer.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; setDrag(true); });
  composer.addEventListener('dragover', (e) => e.preventDefault());
  composer.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; setDrag(false); } });
  composer.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; setDrag(false);
    handleFile(e.dataTransfer?.files?.[0]);
  });
}
