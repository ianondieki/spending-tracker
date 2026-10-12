// Lighthouse, mobile profile, on the weekly and monthly fixture pages. Prints scores and writes
// apps/web/screenshots/lighthouse.json. Run after `pnpm build`.
import { writeFileSync } from 'node:fs';

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';

import { startServer } from './serve.mjs';

const { base, stop } = await startServer();
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
const results = [];
try {
  for (const fixture of ['weekly-en', 'monthly-en']) {
    const url = `${base}/dev/report?fixture=${fixture}`;
    const run = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'], formFactor: 'mobile', screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } });
    const cats = run.lhr.categories;
    const scores = { fixture, performance: Math.round(cats.performance.score * 100), accessibility: Math.round(cats.accessibility.score * 100), bestPractices: Math.round(cats['best-practices'].score * 100), lcpMs: Math.round(run.lhr.audits['largest-contentful-paint'].numericValue), tbtMs: Math.round(run.lhr.audits['total-blocking-time'].numericValue), cls: run.lhr.audits['cumulative-layout-shift'].numericValue };
    results.push(scores);
    console.log(scores);
  }
} finally {
  await chrome.kill();
  stop();
}
writeFileSync(new URL('../screenshots/lighthouse.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
