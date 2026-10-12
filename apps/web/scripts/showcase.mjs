// Showcase recordings: a 25 to 35 second walkthrough of the weekly-en report at 412×915 (mobile) and 1440×900
// (desktop): open, scroll the tally, two charts, a data-table toggle, the print view. Writes
// docs/sprint/showcase/report-web-<mobile|desktop>.webm plus a first-frame PNG. Run after `pnpm build`.
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { startServer } from './serve.mjs';

const outDir = fileURLToPath(new URL('../../../docs/sprint/showcase/', import.meta.url));
const tmpDir = fileURLToPath(new URL('../.showcase-tmp/', import.meta.url));
mkdirSync(outDir, { recursive: true });
rmSync(tmpDir, { recursive: true, force: true });
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* eslint-disable no-undef -- the evaluate callback runs in the page */
async function glide(page, to, ms = 1200) {
  // Smooth scroll in ~16 ms steps so the recording reads as a hand scroll, not a jump.
  await page.evaluate(
    async ({ to, ms }) => {
      const from = window.scrollY;
      const start = performance.now();
      await new Promise((done) => {
        const step = (t) => {
          const p = Math.min(1, (t - start) / ms);
          const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
          window.scrollTo(0, from + (to - from) * e);
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    },
    { to, ms },
  );
}

/* eslint-enable no-undef */
async function record(base, name, viewport, isMobile) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    recordVideo: { dir: tmpDir, size: viewport },
  });
  const page = await context.newPage();
  await page.goto(`${base}/dev/report?fixture=weekly-en`, { waitUntil: 'networkidle' });
  await page.evaluate('document.fonts.ready');
  await pause(1530); // the tally rows and the double rule draw in

  const top = async (sel) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY); // eslint-disable-line no-undef
  const pad = isMobile ? 16 : 48;

  await glide(page, (await top('.h-tally__total')) - viewport.height * 0.45, 1400);
  await pause(918);
  await glide(page, (await top('.h-section--kpis')) - pad, 1200);
  await pause(918);
  await glide(page, (await top('#chart-in_out')) - pad, 1400);
  await pause(1530);
  await glide(page, (await top('#chart-categories')) - pad, 1400);
  await pause(1530);
  await glide(page, (await top('#chart-daily')) - pad, 1400);
  await pause(1101);
  // Data table toggle on the visible copy of the daily chart.
  const toggle = page.locator('#chart-daily .h-chart__data').locator('visible=true').first().locator('summary');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await pause(1346);
  await glide(page, (await top('#chart-daily')) - pad + viewport.height * 0.55, 1200);
  await pause(979);
  await toggle.click();
  await pause(489);
  await glide(page, (await top('.h-section--watch')) - pad, 1800);
  await pause(1101);
  await glide(page, (await top('.h-footer')) - viewport.height + 200, 1200);
  await pause(918);
  // Print view: the page as the PDF is made from it.
  await page.emulateMedia({ media: 'print' });
  await glide(page, 0, 1600);
  await pause(1836);
  await glide(page, (await top('#chart-categories')) - pad, 1800);
  await pause(1530);

  const video = page.video();
  await context.close();
  await browser.close();
  const src = await video.path();
  const webm = `${outDir}report-web-${name}.webm`;
  // Re-encode under 3 MB: VP8 at a modest bitrate, the desktop frame scaled to 1152 wide.
  const scale = isMobile ? [] : ['-vf', 'scale=1152:-2'];
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', src, ...scale, '-c:v', 'libvpx', '-b:v', isMobile ? '550k' : '650k', '-crf', '32', '-deadline', 'good', '-cpu-used', '2', '-an', webm]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webm, '-frames:v', '1', '-ss', '0.5', `${outDir}report-web-${name}.png`]);
  const bytes = statSync(webm).size;
  console.log(name, `${(bytes / 1e6).toFixed(2)} MB`);
  return bytes;
}

const { base, stop } = await startServer();
try {
  await record(base, 'mobile', { width: 412, height: 915 }, true);
  await record(base, 'desktop', { width: 1440, height: 900 }, false);
} finally {
  stop();
  rmSync(tmpDir, { recursive: true, force: true });
}
for (const f of readdirSync(outDir)) console.log(f, statSync(`${outDir}${f}`).size);
