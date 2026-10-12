/**
 * Manual check of the report pipeline against the real model. Never run in CI.
 *
 *   pnpm build                                   # from the repo root: this script runs the built dist/
 *   AI_ENABLED=true ANTHROPIC_API_KEY=... AI_DAILY_BUDGET_USD=1 \
 *     pnpm --filter @hesabu/agents try:model [weekly|monthly] [en|sw] [--judge]
 *
 * Without AI_ENABLED=true and a key it does nothing (fail closed). `--dry-run` runs the same wiring with AI
 * off, so it makes no network call and prints the numbers-only report.
 *
 * Uses `sampleFactsSheet(kind)` from @hesabu/analytics when that export exists, otherwise the hand-built sheet
 * from this package's test fixtures (validated with FactsSheetSchema).
 */
const env = process.env;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const kind = args.includes('monthly') ? 'monthly' : 'weekly';
const locale = args.includes('sw') ? 'sw' : 'en';

if (!dryRun && (env['AI_ENABLED'] !== 'true' || !env['ANTHROPIC_API_KEY'])) {
  console.log('Skipped: set AI_ENABLED=true and ANTHROPIC_API_KEY to run against the real model (or pass --dry-run).');
  process.exit(0);
}

let agents;
let fixtures;
let analytics;
try {
  agents = await import('../dist/index.js');
  fixtures = await import('../dist/test-fixtures.js');
  analytics = await import('@hesabu/analytics');
} catch (error) {
  console.error('Could not load the built packages. Run `pnpm build` from the repo root first.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const facts =
  typeof analytics.sampleFactsSheet === 'function'
    ? analytics.FactsSheetSchema.parse(analytics.sampleFactsSheet(kind))
    : fixtures.sampleFacts(kind);

const config = agents.readAiConfig(dryRun ? {} : env);
const ledger = new agents.InMemoryCostLedger();
const guard = new agents.BudgetGuard({ config, ledger });
const client = new agents.AnthropicModelClient({ config, guard, ledger });

const started = Date.now();
const result = await agents.produceReport(
  facts,
  { report_id: `try_${kind}_${started}`, kind, baseUrl: 'https://hesabu.example' },
  { client, guard, ledger, locale, now: new Date(), runJudge: args.includes('--judge') },
);

console.log(JSON.stringify(result.document, null, 2));
console.log('\n--- summary ---');
console.log(
  JSON.stringify(
    {
      writer: result.writer,
      fallback_reason: result.fallback_reason,
      selection: result.selection === null ? null : { source: result.selection.source, ids: result.selection.selected.map((s) => s.id) },
      attempts: result.attempts,
      usage: result.usage,
      cost_usd: result.cost_usd,
      ledger: ledger.entries,
      judge: result.judge,
      fact_check: result.document.meta.fact_check,
      seconds: (Date.now() - started) / 1000,
    },
    null,
    2,
  ),
);
