import { connect, getDatabaseUrl, migrate, type ConnectOptions, type Env, type Sql } from './client.js';
import { SystemDb } from './system.js';
import { TenantDb } from './tenant.js';

export { connect, dropAll, getDatabaseUrl, migrate } from './client.js';
export type { ConnectOptions, Env, MigrationResult, Sql } from './client.js';
export { AddressTakenError, normaliseEmail, TenantDb } from './tenant.js';
export type { DeliveryPatch, ReportPatch, TransactionWindow } from './tenant.js';
export { DeviceRevokedError, SystemDb } from './system.js';
export type { RegisterDeviceInput, RegisteredDevice, ScheduleUser } from './system.js';
export * from './types.js';

/**
 * The database handle the API and worker hold. User data is reachable only through `forUser(id)`;
 * the handful of cross-tenant operations live on `system`.
 */
export class Db {
  readonly system: SystemDb;

  private constructor(private readonly sql: Sql) {
    this.system = new SystemDb(sql);
  }

  static async open(env: Env, opts: ConnectOptions & { migrate?: boolean } = {}): Promise<Db> {
    const sql = connect(getDatabaseUrl(env), opts);
    if (opts.migrate !== false) await migrate(sql);
    return new Db(sql);
  }

  /** For tests and tooling that already hold a connection. */
  static fromSql(sql: Sql): Db {
    return new Db(sql);
  }

  forUser(userId: string): TenantDb {
    return new TenantDb(this.sql, userId);
  }

  async ping(): Promise<boolean> {
    const rows = await this.sql`SELECT 1 AS ok`;
    return rows.length === 1;
  }

  /** Raw access for the worker's queue (pg-boss owns its own schema) and for tests. Never for user data. */
  get rawSql(): Sql {
    return this.sql;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
export * from './tokens.js';
export * from './jobs.js';
export { demoAccounts, demoTransactions, DEMO_CATEGORIES } from './demo-data.js';
export { DbCostLedger, startOfNairobiDay, type LedgerEntry } from './cost-ledger.js';
export { categorise, DEMO_INBOX_PATH, DEMO_VARIABLES, demoInboxAvailable, parseDemoInbox, taxonomyCategoryRows, type DemoInbox } from './demo-inbox.js';
