// Playwright screenshots of every fixture at 360 and 1440 in both themes, plus an axe pass on each page.
// Writes apps/web/screenshots/<fixture>-<theme>-<width>.png. Run after `pnpm build`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

import { startServer } from './serve.mjs';

const FIXTURES = ['weekly-en', 'weekly-sw', 'monthly-en', 'monthly-sw'];
const THEMES = ['light', 'dark'];
const WIDTHS = [360, 1440];
const outDir = new URL('../screenshots/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const { base, stop } = await startServer();
const browser = await chromium.launch();
const violations = [];
try {
  for (const fixture of FIXTURES) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: width < 720 ? 740 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`${base}/dev/report?fixture=${fixture}&theme=${theme}`, { waitUntil: 'networkidle' });
        // eslint-disable-next-line no-undef -- runs in the page
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: fileURLToPath(new URL(`${fixture}-${theme}-${width}.png`, outDir)), fullPage: true });
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
        for (const v of axe.violations) violations.push({ fixture, theme, width, id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help });
        await context.close();
        console.log(`shot ${fixture} ${theme} ${width}: ${axe.violations.length} axe violations`);
      }
    }
  }
} finally {
  await browser.close();
  stop();
}
writeFileSync(new URL('axe.json', outDir), JSON.stringify(violations, null, 2) + '\n');
if (violations.length) {
  console.error('axe violations:', violations);
  process.exit(1);
}
console.log('axe clean on all pages');
