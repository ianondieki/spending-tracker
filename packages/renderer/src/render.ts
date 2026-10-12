import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DEFAULT_WIDTH, HERO, ReportPage, resolveChart, type Theme } from '@hesabu/charts';
import { assertFactsSheet, assertReportDocument, type ChartSection, type FactsSheet, type ReportDocument } from '@hesabu/report-model';

import { browserAvailable, getBrowser, RendererUnavailableError, stubAllowed } from './browser.js';
import { Email, emailText } from './Email.js';
import { Hero, HERO_CSS } from './Hero.js';
import { standalonePage } from './html.js';
import { STUB_PNG, stubPdf } from './stub.js';

export interface RenderOptions {
  readonly theme: Theme;
  readonly locale: 'en' | 'sw';
  /** for links inside email and PDF */
  readonly baseUrl: string;
  /** signed web link for this report */
  readonly reportUrl: string;
}

export interface RenderedReport {
  /** 1080×1350 */
  heroPng: Buffer;
  /** by chart_id, 2× DPR, 1200 px wide */
  chartPngs: Record<string, Buffer>;
  /** A4 portrait, from the web page's print stylesheet */
  pdf: Buffer;
  /** inline-image ready: img src="cid:<chart_id>" and cid:hero */
  emailHtml: string;
  emailText: string;
  /** the standalone report page (also served by apps/web) */
  webHtml: string;
  /** true when no browser was available and HESABU_RENDERER_ALLOW_STUB=1 let placeholders through */
  stubbed: boolean;
}

/** Width the chart is laid out at before the 2× screenshot: 600 CSS px → 1200 px PNG. */
const CHART_CSS_WIDTH = 600;

export function chartSections(doc: ReportDocument): ChartSection[] {
  return doc.sections.filter((s): s is ChartSection => s.type === 'chart');
}

/** The standalone web page (what apps/web also serves). */
export function renderWebHtml(doc: ReportDocument, facts: FactsSheet, opts: RenderOptions): string {
  const body = `<div class="h-page h-page--report"><main id="report">${renderToStaticMarkup(createElement(ReportPage, { document: doc, facts, mode: 'web', reportUrl: opts.reportUrl }))}</main></div>`;
  return standalonePage({ title: `${doc.title}, ${doc.period_label}`, locale: doc.locale, theme: opts.theme, body, description: doc.email.preheader });
}

export function renderHeroHtml(doc: ReportDocument, facts: FactsSheet, theme: Theme): string {
  const body = renderToStaticMarkup(createElement(Hero, { document: doc, facts, theme }));
  return standalonePage({ title: doc.title, locale: doc.locale, theme, body, css: `${HERO_CSS}\nbody { background: var(--h-sheet); }` });
}

export function renderChartHtml(section: ChartSection, facts: FactsSheet, doc: ReportDocument, theme: Theme): string {
  const el = resolveChart(section, facts, { locale: doc.locale, theme, width: CHART_CSS_WIDTH, showTable: false });
  const body = `<div id="chart" style="width:${CHART_CSS_WIDTH}px;padding:0;background:var(--h-sheet)">${renderToStaticMarkup(el)}</div>`;
  return standalonePage({ title: section.title, locale: doc.locale, theme, body, css: 'body { background: var(--h-sheet); }' });
}

export function renderEmail(doc: ReportDocument, opts: RenderOptions, chartIds: readonly string[]): { html: string; text: string } {
  // React 19 hoists <link rel="preload"> for every <img>; email clients have no use for them.
  const markup = renderToStaticMarkup(createElement(Email, { document: doc, reportUrl: opts.reportUrl, baseUrl: opts.baseUrl, chartIds })).replace(/<link rel="preload"[^>]*\/>/g, '');
  const html = '<!doctype html>\n' + markup;
  return { html, text: emailText(doc, opts.reportUrl) };
}

/**
 * Renders every artefact for one report. Deterministic for a given (doc, facts, opts): the HTML is pure React
 * output, fonts are embedded, and Chromium runs with font hinting off. Validates both inputs first (fail closed).
 */
export async function renderReport(docInput: ReportDocument, factsInput: FactsSheet, opts: RenderOptions): Promise<RenderedReport> {
  const doc = assertReportDocument(docInput);
  const facts = assertFactsSheet(factsInput);
  if (doc.locale !== opts.locale) throw new Error(`document locale ${doc.locale} does not match requested ${opts.locale}`);
  const sections = chartSections(doc);
  const webHtml = renderWebHtml(doc, facts, opts);
  const email = renderEmail(doc, opts, sections.map((s) => s.chart_id));

  if (!browserAvailable()) {
    if (!stubAllowed()) throw new RendererUnavailableError();
    return {
      heroPng: STUB_PNG,
      chartPngs: Object.fromEntries(sections.map((s) => [s.chart_id, STUB_PNG])),
      pdf: stubPdf(`${doc.title} ${doc.period_label}`),
      emailHtml: email.html,
      emailText: email.text,
      webHtml,
      stubbed: true,
    };
  }

  const browser = await getBrowser();
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: HERO.width, height: HERO.height }, reducedMotion: 'reduce', colorScheme: opts.theme });
  try {
    const page = await context.newPage();
    await page.setContent(renderHeroHtml(doc, facts, opts.theme), { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    const heroPng = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: HERO.width, height: HERO.height } });

    const chartPngs: Record<string, Buffer> = {};
    const chartContext = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: CHART_CSS_WIDTH, height: 400 }, reducedMotion: 'reduce', colorScheme: opts.theme });
    try {
      const cpage = await chartContext.newPage();
      for (const section of sections) {
        await cpage.setContent(renderChartHtml(section, facts, doc, opts.theme), { waitUntil: 'load' });
        await cpage.evaluate('document.fonts.ready');
        const el = cpage.locator('#chart');
        chartPngs[section.chart_id] = await el.screenshot({ type: 'png' });
      }
    } finally {
      await chartContext.close();
    }

    await page.setViewportSize({ width: DEFAULT_WIDTH + 96, height: 1000 });
    await page.setContent(webHtml, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });

    return { heroPng, chartPngs, pdf, emailHtml: email.html, emailText: email.text, webHtml, stubbed: false };
  } finally {
    await context.close();
  }
}
