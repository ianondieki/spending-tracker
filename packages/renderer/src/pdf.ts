/** PDF inspection for tests: page count, page size and every text run with its box, via pdf.js. */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfText {
  readonly page: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface PdfSummary {
  readonly pages: number;
  readonly width: number;
  readonly height: number;
  readonly texts: readonly PdfText[];
}

export async function inspectPdf(pdf: Buffer): Promise<PdfSummary> {
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
  const texts: PdfText[] = [];
  let width = 0;
  let height = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const view = page.getViewport({ scale: 1 });
    width = view.width;
    height = view.height;
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      texts.push({ page: p, text: item.str, x: x ?? 0, y: y ?? 0, width: item.width });
    }
  }
  await doc.destroy();
  return { pages: doc.numPages, width, height, texts };
}
