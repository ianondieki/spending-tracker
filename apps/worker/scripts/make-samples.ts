/**
 * Generates the sample artefacts the sprint commits for review: docs/sprint/samples/<kind>-<locale>-<theme>/.
 * Runs the real worker workflow against Postgres (DATABASE_URL) with the demo inbox, the numbers-only writer,
 * Lane C's Playwright renderer and filesystem storage; chart PNGs are downscaled from 2× to 1× to keep the repo small.
 *
 *   pnpm -r --filter "@hesabu/worker..." build && DATABASE_URL=... pnpm --filter @hesabu/worker samples
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAiConfig } from '@hesabu/agents';
import { Db, parseDemoInbox } from '@hesabu/db';
import { PNG } from 'pngjs';

import { PackageRenderer } from '../src/adapters/renderer.ts';
import { FsStorage } from '../src/adapters/storage.ts';
import { runReportJob } from '../src/workflow.ts';

const OUT_ROOT = fileURLToPath(new URL('../../../docs/sprint/samples/', import.meta.url));
const NOW = new Date('2026-10-12T09:00:00+03:00');
const PERIODS = { weekly: '2026-10-07', monthly: '2026-09-15' } as const;

function downscale2x(png: Uint8Array): Buffer {
  const src = PNG.sync.read(Buffer.from(png));
  const w = Math.floor(src.width / 2);
  const h = Math.floor(src.height / 2);
  const dst = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const i = (sy: number, sx: number) => src.data[((sy * src.width) + sx) * 4 + c] ?? 0;
        dst.data[(y * w + x) * 4 + c] = Math.round((i(2 * y, 2 * x) + i(2 * y, 2 * x + 1) + i(2 * y + 1, 2 * x) + i(2 * y + 1, 2 * x + 1)) / 4);
  }
    }
  }
  return PNG.sync.write(dst);
}

const db = await Db.open(process.env);
const storageDir = await mkdtemp(join(tmpdir(), 'hesabu-samples-'));
const storage = new FsStorage(storageDir, 'https://hesabu.example');
const renderer = new PackageRenderer();
try {
  const reg = await db.system.registerDevice({ device_id: 'samples-device', platform: 'android', app_version: '1.0.0', display_name: 'Wanjiru' });
  const tenant = db.forUser(reg.user_id);
  const inbox = parseDemoInbox();
  await tenant.upsertCategories(inbox.categories);
  await tenant.upsertAccounts(inbox.accounts);
  await tenant.upsertTransactions(inbox.transactions);
  await tenant.upsertBudget({ category_id: 'food_groceries', period: 'weekly', limit_cents: 600_000 });
  await tenant.upsertBudget({ category_id: 'transport', period: 'monthly', limit_cents: 800_000 });
  console.log(`seeded ${inbox.transactions.length} transactions for ${reg.user_id}`);

  const { resolvePeriod } = await import('@hesabu/analytics');
  for (const kind of ['weekly', 'monthly'] as const) {
    for (const locale of ['en', 'sw'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await tenant.updatePreferences({ locale, theme, channels: [] });
        const period = resolvePeriod(kind, PERIODS[kind], { weekStart: 'monday', now: NOW });
        const report = await tenant.ensureReport(kind, period.start, period.end);
        await tenant.resetReport(report.id);
        const result = await runReportJob(
          {
            db, renderer, storage, ai: readAiConfig({ AI_ENABLED: 'false' }),
            appBaseUrl: 'https://hesabu.example', reportLinkSecret: process.env['REPORT_LINK_SECRET'] ?? 'samples-only-secret-not-for-production-use',
            reportLinkTtlDays: 30, enqueueDeliver: async () => {}, now: () => NOW,
          },
          { user_id: reg.user_id, report_id: report.id, deliver: false },
        );
        if (!result) throw new Error('workflow returned nothing');
        const dir = join(OUT_ROOT, `${kind}-${locale}-${theme}`);
        await rm(dir, { recursive: true, force: true });
        await mkdir(join(dir, 'charts'), { recursive: true });
        const a = result.report.artefacts;
        await writeFile(join(dir, 'hero.png'), await storage.get(a.hero_png_key!));
        await writeFile(join(dir, 'report.pdf'), await storage.get(a.pdf_key!));
        await writeFile(join(dir, 'email.html'), await storage.get(a.html_key!.replace(/web\.html$/, 'email.html')));
        await writeFile(join(dir, 'email.txt'), await storage.get(a.html_key!.replace(/web\.html$/, 'email.txt')));
        await writeFile(join(dir, 'web.html'), await storage.get(a.html_key!));
        await writeFile(join(dir, 'document.json'), JSON.stringify(result.document, null, 2) + '\n');
        await writeFile(join(dir, 'facts.json'), JSON.stringify(result.facts, null, 2) + '\n');
        for (const [chartId, key] of Object.entries(a.chart_keys ?? {})) {
          await writeFile(join(dir, 'charts', `${chartId}.png`), downscale2x(await storage.get(key)));
        }
        console.log(`${kind}-${locale}-${theme}: ${result.writer}, ${Object.keys(a.chart_keys ?? {}).length} charts, fact-check ${result.document.meta.fact_check.passed ? 'passed' : 'FAILED'}`);
      }
    }
  }
} finally {
  await renderer.close();
  await db.close();
  await rm(storageDir, { recursive: true, force: true });
}
