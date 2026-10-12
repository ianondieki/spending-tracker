import type { ReportDocument } from '@hesabu/report-model';

export interface RenderedReport {
  readonly html: string;
  /** 1080×1350 hero image; null until the Playwright renderer lands. */
  readonly heroPng: Uint8Array | null;
  readonly pdf: Uint8Array | null;
  readonly chartPngs: ReadonlyArray<{ readonly id: string; readonly png: Uint8Array }>;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Placeholder renderer: produces a minimal HTML document and no binary outputs. Lane C replaces this
 * with the real pipeline (React Email template, Playwright screenshots, print-stylesheet PDF).
 */
export async function renderReport(doc: ReportDocument): Promise<RenderedReport> {
  const title = escapeHtml(doc.title);
  const html =
    `<!doctype html><html lang="${doc.locale}"><head><meta charset="utf-8">` +
    `<title>${title}</title></head><body><h1>${title}</h1>` +
    `<p>${doc.period.kind} · ${escapeHtml(doc.period.start)} → ${escapeHtml(doc.period.end)}</p>` +
    `</body></html>`;
  return { html, heroPng: null, pdf: null, chartPngs: [] };
}
