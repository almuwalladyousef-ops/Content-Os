import { extractHtml } from './html.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Fetch a URL and extract its main article. */
export async function extractUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const out = extractHtml(html, url);
  if (!out.text.trim()) throw new Error('Could not extract readable content from that page.');
  return out;
}
