import { PDFParse } from 'pdf-parse';

/** Extract text from a PDF buffer. */
export async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    let info;
    try {
      info = await parser.getInfo();
    } catch {
      info = null;
    }
    const title = (info?.info?.Title || '').trim();
    return { title, text: (result.text || '').trim() };
  } finally {
    await parser.destroy?.();
  }
}
