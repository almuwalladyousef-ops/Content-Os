import { marked } from 'marked';
import { JSDOM } from 'jsdom';

/** Plain .txt — return as-is. */
export function extractText(content) {
  return { title: '', text: String(content ?? '') };
}

/** Markdown — render to HTML, then take the human-readable text content. */
export function extractMarkdown(content) {
  const html = marked.parse(String(content ?? ''), { async: false });
  const { document } = new JSDOM(html).window;

  // First heading becomes the title (and is dropped from the body).
  const h1 = document.querySelector('h1, h2');
  const title = h1 ? h1.textContent.trim() : '';
  if (h1) h1.remove();

  // Block elements become paragraphs separated by blank lines.
  const blocks = [];
  for (const el of document.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre')) {
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
  }
  const text = blocks.length ? blocks.join('\n\n') : document.body.textContent.trim();
  return { title, text };
}
