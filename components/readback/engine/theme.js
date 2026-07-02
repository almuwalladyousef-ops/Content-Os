// Dark is the primary listening mode; remember the user's choice.
const KEY = 'readback:theme';

export function initTheme(toggleBtn, rootEl = document.documentElement) {
  const el = rootEl || document.documentElement;
  const saved = localStorage.getItem(KEY);
  if (saved) el.dataset.theme = saved;
  else if (!el.dataset.theme) el.dataset.theme = 'dark';
  toggleBtn?.addEventListener('click', () => {
    const next = el.dataset.theme === 'light' ? 'dark' : 'light';
    el.dataset.theme = next;
    localStorage.setItem(KEY, next);
  });
}
