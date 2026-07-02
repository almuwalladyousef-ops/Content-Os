// Render display tokens into the reading column.
// Words become <span class="w" data-i="tokenIndex"> so the highlighter and
// click-to-seek can find them; punctuation/spaces are plain text; paragraph
// breaks start a new <p>.

export function renderArticle(container, tokens) {
  container.textContent = '';
  const spanByToken = new Map();

  let p = document.createElement('p');
  const flush = () => {
    if (p.childNodes.length) container.appendChild(p);
    p = document.createElement('p');
  };

  for (const tok of tokens) {
    if (tok.type === 'para') {
      flush();
    } else if (tok.type === 'word') {
      const span = document.createElement('span');
      span.className = 'w';
      span.dataset.i = String(tok.i);
      span.textContent = tok.text;
      p.appendChild(span);
      spanByToken.set(tok.i, span);
    } else {
      p.appendChild(document.createTextNode(tok.text));
    }
  }
  flush();

  return { spanByToken };
}
