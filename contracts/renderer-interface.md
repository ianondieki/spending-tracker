# Renderer interface (`@hesabu/renderer`, owned by Lane C, consumed by Lane B)

```ts
import type { FactsSheet, ReportDocument } from "@hesabu/report-model";

export type Theme = "light" | "dark";

export interface RenderOptions {
  theme: Theme;
  locale: "en" | "sw";
  baseUrl: string;          // for links inside email and PDF
  reportUrl: string;        // signed web link for this report
}

export interface RenderedReport {
  heroPng: Buffer;                      // 1080x1350
  chartPngs: Record<string, Buffer>;    // by chart_id, 2x DPR, 1200px wide
  pdf: Buffer;                          // A4 portrait, from the web page's print stylesheet
  emailHtml: string;                    // inline-image ready: img src="cid:<chart_id>" and cid:hero
  emailText: string;                    // plain-text alternative
  webHtml: string;                      // the standalone report page (also served by apps/web)
}

export function renderReport(doc: ReportDocument, facts: FactsSheet, opts: RenderOptions): Promise<RenderedReport>;
```

Until Lane C lands, `packages/renderer` exports a stub that returns a 1×1 PNG, empty chart map, a one-page PDF with
the title, and minimal HTML, so Lane B can integrate and test delivery end to end. Lane B must not depend on anything
else from the package. Rendering must be deterministic for a given (doc, facts, opts) so snapshot tests are stable.
