import { extractText, extractMarkdown } from './text.js';
import { extractHtml } from './html.js';
import { extractUrl } from './url.js';
import { extractPdf } from './pdf.js';
import { extractEpub } from './epub.js';

function extFromName(filename = '') {
  const m = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/**
 * Dispatch an extraction request to the right format handler.
 *
 * Accepts one of:
 *   { type:'text', content }                 paste box
 *   { type:'url',  url }                      URL article
 *   { type:'file', filename, base64 }         dropped file (bytes as base64)
 *   { type:'file', filename, content }        dropped text file (raw string)
 *
 * Returns { title, text } with RAW text — the caller normalizes for speech.
 */
export async function extract(input = {}) {
  const { type } = input;

  if (type === 'text') {
    return extractText(input.content);
  }

  if (type === 'url') {
    if (!input.url) throw new Error('No URL provided.');
    return extractUrl(input.url);
  }

  if (type === 'file') {
    const ext = extFromName(input.filename);
    const asString = () =>
      input.base64 != null
        ? Buffer.from(input.base64, 'base64').toString('utf8')
        : String(input.content ?? '');
    const asBuffer = () =>
      input.base64 != null
        ? Buffer.from(input.base64, 'base64')
        : Buffer.from(String(input.content ?? ''), 'utf8');

    switch (ext) {
      case 'txt':
        return extractText(asString());
      case 'md':
      case 'markdown':
        return extractMarkdown(asString());
      case 'html':
      case 'htm':
        return extractHtml(asString());
      case 'pdf':
        return extractPdf(asBuffer());
      case 'epub':
        return extractEpub(asBuffer());
      default:
        throw new Error(`Unsupported file type: .${ext || '?'}`);
    }
  }

  throw new Error(`Unknown extract type: ${type}`);
}
