import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

export type Env = Readonly<Record<string, string | undefined>>;
export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;

/** Reads DATABASE_URL and refuses to start without a Postgres URL (fail closed). */
export function getDatabaseUrl(env: Env): string {
  const url = env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set; refusing to start (fail closed)');
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// URL');
  }
  return url;
}

export interface ConnectOptions {
  readonly max?: number;
}

/**
 * Opens a connection pool. bigint columns (all money) come back as JS numbers; every cents value in the
 * schema fits comfortably inside Number.MAX_SAFE_INTEGER. Timestamps come back as Date objects.
 */
export function connect(url: string, opts: ConnectOptions = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 8,
    onnotice: () => {},
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number | bigint) => x.toString(),
        parse: (x: string) => {
          const n = Number(x);
          if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${x} is outside the safe integer range`);
          return n;
        },
      },
    },
  });
}

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

/** Applies every `migrations/*.sql` file not yet recorded in `schema_migrations`, in name order, each in its own transaction. */
export async function migrate(sql: Sql): Promise<MigrationResult> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }
    const body = await readFile(new URL(file, `file://${migrationsDir}`), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    applied.push(file);
  }
  return { applied, skipped };
}

/** Drops every Hesabu table (tests and local resets only). Refuses outside test/dev. */
export async function dropAll(sql: Sql, env: Env = process.env): Promise<void> {
  if (env['NODE_ENV'] === 'production') throw new Error('dropAll refused in production');
  await sql.unsafe(`
    DROP TABLE IF EXISTS ai_usage, report_links, audit_log, insights, deliveries, reports, recurrences, budgets, rules,
      merchants, categories, transactions, accounts, consents, devices, users, schema_migrations CASCADE;
    DROP TABLE IF EXISTS pgboss.job CASCADE;
  `);
}
