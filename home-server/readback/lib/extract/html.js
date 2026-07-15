import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE',
  'TD', 'TH', 'TR', 'UL',
]);

/** Convert HTML to prose without losing spaces at inline-element boundaries. */
export function htmlToSpeakableText(html) {
  const { document } = new JSDOM(`<body>${String(html ?? '')}</body>`).window;
  let out = '';

  const paragraph = () => {
    out = out.replace(/[ \t]+$/g, '');
    if (out && !out.endsWith('\n\n')) out += '\n\n';
  };
  const appendText = (raw) => {
    const collapsed = String(raw ?? '').replace(/\s+/g, ' ');
    const core = collapsed.trim();
    if (!core) {
      if (out && !/\s$/.test(out)) out += ' ';
      return;
    }
    if (out && !/\s$/.test(out)) {
      const previous = out.at(-1);
      const next = core[0];
      const authoredSpace = /^\s/.test(collapsed);
      const joinedWords = /[\p{L}\p{N}]$/u.test(previous) && /^[\p{L}\p{N}]/u.test(next);
      if (authoredSpace || joinedWords) out += ' ';
    }
    out += core;
    if (/\s$/.test(collapsed)) out += ' ';
  };
  const visit = (node) => {
    if (node.nodeType === 3) return appendText(node.nodeValue);
    if (node.nodeType !== 1) return;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) return;
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) paragraph();
    if (node.tagName === 'BR') paragraph();
    else for (const child of node.childNodes) visit(child);
    if (block) paragraph();
  };

  for (const child of document.body.childNodes) visit(child);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract the main article from an HTML document string, stripping nav/ads/
 * footer chrome via Mozilla Readability. `url` (optional) improves relative
 * link resolution but is not required.
 */
export function extractHtml(html, url) {
  const dom = new JSDOM(String(html ?? ''), url ? { url } : undefined);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (article && article.textContent && article.textContent.trim()) {
    return {
      title: (article.title || '').trim(),
      text: htmlToSpeakableText(article.content || article.textContent),
    };
  }

  // Fallback: Readability bailed (too little content) — take the body text.
  const { document } = dom.window;
  const title = (document.querySelector('title')?.textContent || '').trim();
  return { title, text: htmlToSpeakableText(document.body?.innerHTML || '') };
}
