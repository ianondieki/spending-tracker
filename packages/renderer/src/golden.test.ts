/**
 * Browser-backed tests: dimensions of every binary and a pixel comparison of the hero against the committed
 * goldens. Skipped when no Chromium is available (CI without `playwright install`). `pnpm golden` rewrites the
 * goldens after a deliberate design change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';

import { fixtures, type FixtureName } from '@hesabu/report-model';

import { browserAvailable, closeBrowser } from './browser.js';
import { pngSize } from './png.js';
import { renderReport, type RenderOptions } from './render.js';

const goldenDir = join(import.meta.dirname, '..', 'golden');
const WRITE = process.env.HESABU_RENDERER_GOLDEN === 'write';
const has = browserAvailable();

const CASES: ReadonlyArray<readonly [FixtureName, 'light' | 'dark']> = [
  ['weekly-en', 'light'],
  ['weekly-en', 'dark'],
  ['monthly-sw', 'light'],
  ['monthly-sw', 'dark'],
];

function differingPixels(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    if (Math.abs(pa.data[i]! - pb.data[i]!) > 16 || Math.abs(pa.data[i + 1]! - pb.data[i + 1]!) > 16 || Math.abs(pa.data[i + 2]! - pb.data[i + 2]!) > 16) diff++;
  }
  return diff / (pa.width * pa.height);
}

afterAll(async () => {
  await closeBrowser();
});

describe.skipIf(!has)('renderReport with Chromium', () => {
  it.each(CASES)('%s %s renders every artefact at the right size and matches its golden hero', async (name, theme) => {
    const { document: doc, facts } = fixtures[name];
    const opts: RenderOptions = { theme, locale: doc.locale, baseUrl: 'https://hesabu.test', reportUrl: 'https://hesabu.test/r/token' };
    const out = await renderReport(doc, facts, opts);
    expect(out.stubbed).toBe(false);
    expect(pngSize(out.heroPng)).toEqual({ width: 1080, height: 1350 });
    const ids = doc.sections.filter((s) => s.type === 'chart').map((s) => (s.type === 'chart' ? s.chart_id : ''));
    expect(Object.keys(out.chartPngs).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const size = pngSize(out.chartPngs[id]!);
      expect(size.width, id).toBe(1200);
      expect(size.height, id).toBeGreaterThan(100);
    }
    expect(out.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(out.pdf.length).toBeGreaterThan(20_000);
    expect(out.emailHtml).toContain('cid:hero');

    const file = join(goldenDir, `hero-${name}-${theme}.png`);
    if (WRITE || !existsSync(file)) {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(file, out.heroPng);
    }
    const golden = readFileSync(file);
    // Font rasterisation can differ slightly between machines; the design must not.
    expect(differingPixels(out.heroPng, golden)).toBeLessThan(0.01);
  }, 60_000);

  it('is deterministic for the same input', async () => {
    const { document: doc, facts } = fixtures['weekly-en'];
    const opts: RenderOptions = { theme: 'light', locale: 'en', baseUrl: 'https://hesabu.test', reportUrl: 'https://hesabu.test/r/token' };
    const a = await renderReport(doc, facts, opts);
    const b = await renderReport(doc, facts, opts);
    expect(a.webHtml).toBe(b.webHtml);
    expect(a.emailHtml).toBe(b.emailHtml);
    expect(differingPixels(a.heroPng, b.heroPng)).toBe(0);
    expect(differingPixels(a.chartPngs['categories']!, b.chartPngs['categories']!)).toBe(0);
  }, 60_000);
});

describe('without a browser', () => {
  it('fails closed unless the stub is explicitly allowed', async () => {
    const { document: doc, facts } = fixtures['weekly-en'];
    const opts: RenderOptions = { theme: 'light', locale: 'en', baseUrl: 'https://hesabu.test', reportUrl: 'https://hesabu.test/r/token' };
    const { renderReport: fresh, RendererUnavailableError } = await import('./index.js');
    if (has) {
      expect(fresh).toBeTypeOf('function');
      expect(RendererUnavailableError).toBeTypeOf('function');
      return;
    }
    delete process.env.HESABU_RENDERER_ALLOW_STUB;
    await expect(fresh(doc, facts, opts)).rejects.toBeInstanceOf(RendererUnavailableError);
    process.env.HESABU_RENDERER_ALLOW_STUB = '1';
    const out = await fresh(doc, facts, opts);
    expect(out.stubbed).toBe(true);
    expect(pngSize(out.heroPng)).toEqual({ width: 1, height: 1 });
    expect(out.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(out.webHtml).toContain('h-tally');
  });

  it('rejects a document that does not validate', async () => {
    const { document: doc, facts } = fixtures['weekly-en'];
    const opts: RenderOptions = { theme: 'light', locale: 'en', baseUrl: 'https://hesabu.test', reportUrl: 'https://hesabu.test/r/token' };
    await expect(renderReport({ ...doc, sections: [] }, facts, opts)).rejects.toThrow(/ReportDocument failed validation/);
    await expect(renderReport({ ...doc, locale: 'sw' }, facts, opts)).rejects.toThrow();
  });
});
