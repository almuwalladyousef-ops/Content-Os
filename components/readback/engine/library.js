// Library list rendering. Save/open/resume orchestration lives in main.js.

export function formatTime(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function renderList(container, articles, { onOpen, onDelete }) {
  container.textContent = '';
  if (!articles.length) {
    const empty = document.createElement('p');
    empty.className = 'lib-empty';
    empty.textContent = 'Nothing saved yet. Read something, then tap the bookmark.';
    container.appendChild(empty);
    return;
  }

  for (const a of articles) {
    const item = document.createElement('div');
    item.className = 'lib-item';

    const main = document.createElement('div');
    main.className = 'lib-main';
    main.tabIndex = 0;
    main.setAttribute('role', 'button');

    const title = document.createElement('div');
    title.className = 'lib-title';
    title.textContent = a.title || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'lib-meta';
    const pieces = [`${a.wordCount} words`];
    if (a.durationMs) pieces.push(formatTime(a.durationMs));
    if (a.read) pieces.push('✓ read');
    meta.innerHTML = pieces
      .map((p) => (p === '✓ read' ? `<span class="read-badge">${p}</span>` : p))
      .join('  ·  ');

    main.append(title, meta);

    const pct = a.durationMs ? Math.min(100, (a.progressMs / a.durationMs) * 100) : 0;
    if (pct > 1 && pct < 99) {
      const bar = document.createElement('div');
      bar.className = 'lib-progress';
      const fill = document.createElement('span');
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      main.appendChild(bar);
    }

    main.addEventListener('click', () => onOpen(a.id));
    main.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(a.id); }
    });

    const actions = document.createElement('div');
    actions.className = 'lib-actions';
    const del = document.createElement('button');
    del.className = 'btn btn-icon btn-ghost';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete');
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"/></svg>';
    del.addEventListener('click', () => onDelete(a.id));
    actions.appendChild(del);

    item.append(main, actions);
    container.appendChild(item);
  }
}
