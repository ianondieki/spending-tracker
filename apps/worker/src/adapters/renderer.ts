/**
 * The renderer boundary (contracts/renderer-interface.md). `PackageRenderer` wraps Lane C's `@hesabu/renderer`;
 * `StubRenderer` is the dependency-free fake for tests (1×1 PNG, one-page PDF, minimal HTML).
 */
import type { FactsSheet } from '@hesabu/analytics';
import type { ReportDocument } from '@hesabu/agents';

export type Theme = 'light' | 'dark';

export interface RenderOptions {
  theme: Theme;
  locale: 'en' | 'sw';
  baseUrl: string;
  reportUrl: string;
}

export interface RenderedReport {
  heroPng: Uint8Array;
  chartPngs: Record<string, Uint8Array>;
  pdf: Uint8Array;
  emailHtml: string;
  emailText: string;
  webHtml: string;
}

export interface Renderer {
  readonly name: string;
  render(doc: ReportDocument, facts: FactsSheet, opts: RenderOptions): Promise<RenderedReport>;
}

/** A valid 1×1 transparent PNG. */
export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** A one-page PDF containing the title (hand-built, deterministic, no dependencies). */
export function minimalPdf(title: string): Uint8Array {
  const safe = title.replace(/[()\\]/g, ' ').replace(/[^\x20-\x7e]/g, '?');
  const content = `BT /F1 18 Tf 50 780 Td (${safe}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

export class StubRenderer implements Renderer {
  readonly name = 'stub';
  async render(doc: ReportDocument, _facts: FactsSheet, opts: RenderOptions): Promise<RenderedReport> {
    const title = escapeHtml(doc.title);
    const chartIds = doc.sections.flatMap((s) => (s.type === 'chart' ? [s.chart_id] : []));
    const chartPngs: Record<string, Uint8Array> = {};
    for (const id of chartIds) chartPngs[id] = ONE_PIXEL_PNG;
    const imgs = chartIds.map((id) => `<img src="cid:${escapeHtml(id)}" alt="${escapeHtml(id)}">`).join('');
    const webHtml = `<!doctype html><html lang="${doc.locale}"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${escapeHtml(doc.period_label)}</p></body></html>`;
    const emailHtml = `<!doctype html><html lang="${doc.locale}"><body><img src="cid:hero" alt="${title}"><h1>${title}</h1>${imgs}<p><a href="${escapeHtml(opts.reportUrl)}">${title}</a></p></body></html>`;
    const emailText = `${doc.title}\n${doc.period_label}\n${doc.whatsapp.caption}\n${opts.reportUrl}\n`;
    return { heroPng: ONE_PIXEL_PNG, chartPngs, pdf: minimalPdf(doc.title), emailHtml, emailText, webHtml };
  }
}

/** `@hesabu/renderer` (Lane C): Playwright-rendered hero, charts and PDF; fails closed without a browser unless HESABU_RENDERER_ALLOW_STUB=1. */
export class PackageRenderer implements Renderer {
  readonly name = 'package';

  async render(doc: ReportDocument, facts: FactsSheet, opts: RenderOptions): Promise<RenderedReport> {
    const mod = await import('@hesabu/renderer');
    const out = await mod.renderReport(doc as never, facts as never, opts);
    return { heroPng: out.heroPng, chartPngs: out.chartPngs, pdf: out.pdf, emailHtml: out.emailHtml, emailText: out.emailText, webHtml: out.webHtml };
  }

  async close(): Promise<void> {
    const mod = await import('@hesabu/renderer');
    await mod.closeBrowser();
  }
}
