/**
 * Shared test harness: opens DATABASE_URL (default: the compose/CI credentials), migrates from a
 * clean slate once per test file and hands out a Db. When Postgres is unreachable and CI is not set,
 * the suite is skipped with a warning instead of failing a laptop without a database; in CI it fails.
 */
import { connect, dropAll, migrate, type Sql } from './client.js';
import { Db } from './index.js';

export const TEST_DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgres://hesabu:hesabu@localhost:5432/hesabu';

export async function canReachDatabase(): Promise<boolean> {
  let sql: Sql | null = null;
  try {
    sql = connect(TEST_DATABASE_URL, { max: 1 });
    await sql`SELECT 1`;
    return true;
  } catch {
    if (process.env['CI']) throw new Error(`CI requires Postgres at ${TEST_DATABASE_URL}`);
    console.warn(`[db tests] skipped: cannot reach ${TEST_DATABASE_URL}`);
    return false;
  } finally {
    await sql?.end({ timeout: 1 });
  }
}

export async function openTestDb(): Promise<Db> {
  const sql = connect(TEST_DATABASE_URL, { max: 4 });
  await dropAll(sql, { NODE_ENV: 'test' });
  await migrate(sql);
  return Db.fromSql(sql);
}
