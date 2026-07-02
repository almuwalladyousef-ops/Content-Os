import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

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
      text: article.textContent.replace(/\n{3,}/g, '\n\n').trim(),
    };
  }

  // Fallback: Readability bailed (too little content) — take the body text.
  const { document } = dom.window;
  const title = (document.querySelector('title')?.textContent || '').trim();
  return { title, text: (document.body?.textContent || '').trim() };
}
