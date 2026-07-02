import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EPub } from 'epub2';
import { JSDOM } from 'jsdom';

function htmlToText(html) {
  const { document } = new JSDOM(String(html ?? '')).window;
  const blocks = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote')) {
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
  }
  return blocks.length ? blocks.join('\n\n') : document.body.textContent.trim();
}

/** Extract concatenated chapter text from an EPUB buffer. */
export async function extractEpub(buffer) {
  // epub2 reads from a file path, so stage the upload in a temp file.
  const tmp = join(tmpdir(), `readback-${randomUUID()}.epub`);
  await writeFile(tmp, buffer);
  try {
    const epub = await EPub.createAsync(tmp);
    const title = (epub.metadata?.title || '').trim();
    const parts = [];
    for (const item of epub.flow) {
      try {
        const raw = await epub.getChapterAsync(item.id);
        const text = htmlToText(raw);
        if (text) parts.push(text);
      } catch {
        // Skip unreadable spine items rather than failing the whole book.
      }
    }
    return { title, text: parts.join('\n\n').trim() };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
