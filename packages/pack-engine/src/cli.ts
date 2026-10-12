#!/usr/bin/env node
/**
 * pack-engine CLI.
 *
 *   pack-engine run --pack <file> [--pack <file>…] --corpus <jsonl> [--corpus <jsonl>…] [--var name=value] [--json]
 *   pack-engine examples [--pack <file>…]          (defaults to every pack in contracts/provider-packs)
 *   pack-engine validate --pack <file>
 *
 * Prints per-family counts, duplicates, transfer pairs, balance-chain breaks and every unknown message body.
 */
import { readJsonl, runCorpus, type CorpusLine } from './corpus.js';
import { loadAllPacks, loadPackFile, PackLoadError, type CompiledPack } from './loader.js';
import { runExamples } from './examples.js';

interface Args {
  command: string;
  packs: string[];
  corpora: string[];
  vars: Record<string, string>;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? 'help', packs: [], corpora: [], vars: { sim_msisdn_masked: '07XXXXX000', acct_mask: '***000' }, json: false };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = () => {
      i += 1;
      const v = argv[i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--pack') args.packs.push(next());
    else if (a === '--corpus') args.corpora.push(next());
    else if (a === '--var') {
      const [k, ...rest] = next().split('=');
      args.vars[k!] = rest.join('=');
    } else if (a === '--json') args.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

function loadPacks(files: string[]): CompiledPack[] {
  return files.length ? files.map((f) => loadPackFile(f)) : loadAllPacks();
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  try {
    switch (args.command) {
      case 'validate': {
        const packs = loadPacks(args.packs);
        for (const p of packs) console.log(`${p.pack.pack_id} ${p.pack.version}: ${p.families.length} families OK`);
        return 0;
      }
      case 'examples': {
        const packs = loadPacks(args.packs);
        let failed = 0;
        for (const p of packs) {
          const failures = runExamples(p);
          const n = p.families.reduce((s, f) => s + f.family.examples.length, 0);
          console.log(`${p.pack.pack_id}: ${n - failures.length}/${n} examples pass`);
          for (const f of failures) {
            failed += 1;
            console.log(`  FAIL ${f.family_id}[${f.example_index}]: ${f.problem}`);
          }
        }
        return failed ? 1 : 0;
      }
      case 'run': {
        if (args.corpora.length === 0) throw new Error('run needs at least one --corpus <jsonl>');
        const packs = loadPacks(args.packs);
        const lines: CorpusLine[] = args.corpora.flatMap((f) => readJsonl(f));
        const result = runCorpus(packs, lines, { variables: args.vars });
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                total: result.total,
                not_ours: result.not_ours,
                parsed: result.parsed,
                ignored: result.ignored,
                unknown: result.unknown.map((u) => ({ index: u.index, sender: u.line.sender, body: u.line.body })),
                per_family: Object.fromEntries(result.per_family),
                duplicates: result.post.duplicates,
                transfer_pairs: result.post.transfer_pairs,
                balance: result.post.balance,
                transactions: result.post.transactions,
              },
              null,
              2,
            ),
          );
          return result.unknown.length ? 1 : 0;
        }
        console.log(`messages: ${result.total}  parsed: ${result.parsed}  ignored: ${result.ignored}  unknown: ${result.unknown.length}  not ours: ${result.not_ours}`);
        console.log('per family:');
        for (const [family, count] of [...result.per_family.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(5)}  ${family}`);
        console.log(`duplicates dropped: ${result.post.duplicates}`);
        console.log(`transfer pairs: ${result.post.transfer_pairs.length}`);
        console.log(`balance chain: ${result.post.balance.checked} checked, ${result.post.balance.breaks.length} breaks`);
        for (const b of result.post.balance.breaks) console.log(`  break ${b.account_ref} tx ${b.transaction_id}: expected ${b.expected_cents} got ${b.actual_cents}`);
        if (result.unknown.length) {
          console.log('unknown messages:');
          for (const u of result.unknown) console.log(`  [${u.index}] ${u.line.sender}: ${u.line.body}`);
        }
        return result.unknown.length ? 1 : 0;
      }
      default:
        console.log('usage: pack-engine <validate|examples|run> [--pack file]… [--corpus jsonl]… [--var k=v] [--json]');
        return args.command === 'help' ? 0 : 2;
    }
  } catch (e) {
    if (e instanceof PackLoadError) console.error(e.message);
    else console.error((e as Error).stack ?? String(e));
    return 1;
  }
}

if (process.argv[1] && /cli\.(?:js|ts)$/.test(process.argv[1])) {
  process.exitCode = main();
}
