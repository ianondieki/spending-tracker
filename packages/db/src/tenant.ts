/**
 * Tenant query layer. The only way to read or write user data is through `TenantDb`, which is
 * constructed with a user id and injects it into every statement (and sets `app.user_id` so the
 * row-level-security policies apply too). There is no method that takes a user id as a parameter:
 * a caller cannot forget it. Non-tenant operations live in `SystemDb` and are deliberately few.
 */
import type { Account, Transaction } from '@hesabu/analytics';
import type postgres from 'postgres';

import type { Sql, TransactionSql } from './client.js';
import type {
  AccountRow, AiUsageEntry, BudgetRow, CategoryRow, Channel, ConsentPurpose, DeliveryRow, DeliveryStatus,
  Preferences, ReportArtefacts, ReportKind, ReportLinkRow, ReportRow, ReportStatus, SyncOutcome, TransactionRow,
  UserRow, Writer,
} from './types.js';

const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString();
const isoReq = (d: Date | string): string => iso(d) as string;

type Row = Record<string, unknown>;

function mapUser(r: Row): UserRow {
  return {
    id: r['id'] as string,
    phone_e164: (r['phone_e164'] as string | null) ?? null,
    email: (r['email'] as string | null) ?? null,
    whatsapp_e164: (r['whatsapp_e164'] as string | null) ?? null,
    display_name: (r['display_name'] as string | null) ?? null,
    locale: r['locale'] as UserRow['locale'],
    week_start: r['week_start'] as UserRow['week_start'],
    weekly_at: r['weekly_at'] as string,
    monthly_at: r['monthly_at'] as string,
    channels: r['channels'] as Channel[],
    theme: r['theme'] as UserRow['theme'],
    created_at: isoReq(r['created_at'] as Date),
  };
}

function mapAccount(r: Row): AccountRow {
  return {
    id: r['id'] as string,
    account_ref: r['account_ref'] as string,
    provider: r['provider'] as Account['provider'],
    institution: (r['institution'] as string | null) ?? null,
    label: r['label'] as string,
    mask: (r['mask'] as string | null) ?? null,
    last_balance_cents: (r['last_balance_cents'] as number | null) ?? null,
    last_balance_at: iso(r['last_balance_at'] as Date | null),
  };
}

function mapTransaction(r: Row): TransactionRow {
  return {
    id: r['id'] as string,
    account_ref: r['account_ref'] as string,
    provider: r['provider'] as Transaction['provider'],
    external_ref: (r['external_ref'] as string | null) ?? null,
    type: r['type'] as Transaction['type'],
    direction: r['direction'] as Transaction['direction'],
    amount_cents: r['amount_cents'] as number,
    fee_cents: r['fee_cents'] as number,
    balance_after_cents: (r['balance_after_cents'] as number | null) ?? null,
    occurred_at: isoReq(r['occurred_at'] as Date),
    received_at: isoReq(r['received_at'] as Date),
    counterparty: r['counterparty'] as Transaction['counterparty'],
    category_id: (r['category_id'] as string | null) ?? null,
    category_source: r['category_source'] as Transaction['category_source'],
    category_confidence: (r['category_confidence'] as number | null) ?? 0,
    is_transfer: r['is_transfer'] as boolean,
    transfer_pair_id: (r['transfer_pair_id'] as string | null) ?? null,
    parse_confidence: r['parse_confidence'] as number,
    source: r['source'] as Transaction['source'],
    raw_hash: r['raw_hash'] as string,
    parser: r['parser'] as Transaction['parser'],
    user_edited: r['user_edited'] as boolean,
    note: (r['note'] as string | null) ?? null,
    tags: (r['tags'] as string[]) ?? [],
    updated_at: isoReq(r['updated_at'] as Date),
    synced_at: isoReq(r['synced_at'] as Date),
  };
}

function mapReport(r: Row): ReportRow {
  return {
    id: r['id'] as string,
    user_id: r['user_id'] as string,
    kind: r['kind'] as ReportKind,
    period_start: isoReq(r['period_start'] as Date),
    period_end: isoReq(r['period_end'] as Date),
    status: r['status'] as ReportStatus,
    writer: r['writer'] as Writer,
    facts_json: r['facts_json'] ?? null,
    document_json: r['document_json'] ?? null,
    artefacts: (r['artefacts'] as ReportArtefacts) ?? {},
    input_tokens: r['input_tokens'] as number,
    output_tokens: r['output_tokens'] as number,
    cost_usd: Number(r['cost_usd']),
    last_error: (r['last_error'] as string | null) ?? null,
    generated_at: iso(r['generated_at'] as Date | null),
    created_at: isoReq(r['created_at'] as Date),
    updated_at: isoReq(r['updated_at'] as Date),
  };
}

function mapDelivery(r: Row): DeliveryRow {
  return {
    id: r['id'] as string,
    report_id: r['report_id'] as string,
    channel: r['channel'] as Channel,
    status: r['status'] as DeliveryStatus,
    provider_message_id: (r['provider_message_id'] as string | null) ?? null,
    attempts: r['attempts'] as number,
    last_error: (r['last_error'] as string | null) ?? null,
    cost_usd: Number(r['cost_usd']),
    updated_at: isoReq(r['updated_at'] as Date),
  };
}

export interface ReportPatch {
  status?: ReportStatus;
  writer?: Writer;
  facts_json?: unknown;
  document_json?: unknown;
  artefacts?: ReportArtefacts;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  last_error?: string | null;
  generated_at?: string | null;
}

export interface DeliveryPatch {
  status?: DeliveryStatus;
  provider_message_id?: string | null;
  last_error?: string | null;
  cost_usd?: number;
  bump_attempts?: boolean;
}

export interface TransactionWindow {
  readonly from: string; // inclusive ISO
  readonly to: string; // exclusive ISO
}

export class TenantDb {
  constructor(
    private readonly sql: Sql,
    readonly userId: string,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new TypeError('TenantDb needs a user id');
  }

  /** Runs `fn` in a transaction with `app.user_id` set so RLS policies see the tenant. */
  private tx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.user_id', ${this.userId}, true)`;
      return fn(tx);
    }) as Promise<T>;
  }

  // ----- users and preferences -----

  async getUser(): Promise<UserRow | null> {
    const rows = await this.tx((tx) => tx`SELECT * FROM users WHERE id = ${this.userId}`);
    return rows[0] ? mapUser(rows[0] as Row) : null;
  }

  async getPreferences(): Promise<Preferences> {
    const u = await this.getUser();
    if (!u) throw new Error('user not found');
    const { email, whatsapp_e164, locale, week_start, weekly_at, monthly_at, channels, theme } = u;
    return { email, whatsapp_e164, locale, week_start, weekly_at, monthly_at, channels, theme };
  }

  async updatePreferences(p: Partial<Preferences>): Promise<Preferences> {
    await this.tx(
      (tx) => tx`UPDATE users SET
        email = COALESCE(${p.email === undefined ? null : p.email}, CASE WHEN ${p.email === undefined} THEN email ELSE NULL END),
        whatsapp_e164 = COALESCE(${p.whatsapp_e164 === undefined ? null : p.whatsapp_e164}, CASE WHEN ${p.whatsapp_e164 === undefined} THEN whatsapp_e164 ELSE NULL END),
        locale = COALESCE(${p.locale ?? null}, locale),
        week_start = COALESCE(${p.week_start ?? null}, week_start),
        weekly_at = COALESCE(${p.weekly_at ?? null}, weekly_at),
        monthly_at = COALESCE(${p.monthly_at ?? null}, monthly_at),
        channels = COALESCE(${p.channels ? tx.json(p.channels) : null}, channels),
        theme = COALESCE(${p.theme ?? null}, theme),
        updated_at = now()
      WHERE id = ${this.userId}`,
    );
    return this.getPreferences();
  }

  // ----- consents -----

  async grantConsent(purpose: ConsentPurpose, version = '1'): Promise<void> {
    await this.tx(async (tx) => {
      await tx`UPDATE consents SET revoked_at = now() WHERE user_id = ${this.userId} AND purpose = ${purpose} AND revoked_at IS NULL`;
      await tx`INSERT INTO consents (user_id, purpose, version) VALUES (${this.userId}, ${purpose}, ${version})`;
    });
  }

  async revokeConsent(purpose: ConsentPurpose): Promise<void> {
    await this.tx(
      (tx) => tx`UPDATE consents SET revoked_at = now() WHERE user_id = ${this.userId} AND purpose = ${purpose} AND revoked_at IS NULL`,
    );
  }

  async hasConsent(purpose: ConsentPurpose): Promise<boolean> {
    const rows = await this.tx(
      (tx) => tx`SELECT 1 FROM consents WHERE user_id = ${this.userId} AND purpose = ${purpose} AND revoked_at IS NULL LIMIT 1`,
    );
    return rows.length > 0;
  }

  // ----- accounts -----

  async upsertAccounts(accounts: readonly Account[]): Promise<number> {
    if (accounts.length === 0) return 0;
    await this.tx(async (tx) => {
      for (const a of accounts) {
        await tx`INSERT INTO accounts (user_id, account_ref, provider, institution, label, mask, last_balance_cents, last_balance_at)
          VALUES (${this.userId}, ${a.account_ref}, ${a.provider}, ${a.institution ?? null}, ${a.label}, ${a.mask ?? null},
                  ${a.last_balance_cents ?? null}, ${a.last_balance_at ?? null})
          ON CONFLICT (user_id, account_ref) DO UPDATE SET
            provider = EXCLUDED.provider, institution = EXCLUDED.institution, label = EXCLUDED.label, mask = EXCLUDED.mask,
            last_balance_cents = COALESCE(EXCLUDED.last_balance_cents, accounts.last_balance_cents),
            last_balance_at = COALESCE(EXCLUDED.last_balance_at, accounts.last_balance_at),
            updated_at = now()
          WHERE accounts.user_id = ${this.userId}`;
      }
    });
    return accounts.length;
  }

  async listAccounts(): Promise<AccountRow[]> {
    const rows = await this.tx((tx) => tx`SELECT * FROM accounts WHERE user_id = ${this.userId} ORDER BY label`);
    return rows.map((r) => mapAccount(r as Row));
  }

  // ----- transactions -----

  /**
   * Idempotent upsert by transaction id: an existing row is only replaced when the incoming
   * `updated_at` is newer. A row whose provider reference or message hash already exists under a
   * different id is rejected (the device keeps the first id). A row whose id belongs to another
   * user is rejected without revealing why.
   */
  async upsertTransactions(txs: readonly Transaction[]): Promise<SyncOutcome> {
    const rejected: SyncOutcome['rejected'] = [];
    let accepted = 0;
    await this.tx(async (tx) => {
      for (const t of txs) {
        try {
          await tx.savepoint(async (sp) => {
            const rows = await sp`INSERT INTO transactions (
                id, user_id, account_ref, provider, external_ref, type, direction, amount_cents, fee_cents,
                balance_after_cents, occurred_at, received_at, counterparty, category_id, category_source,
                category_confidence, is_transfer, transfer_pair_id, parse_confidence, source, raw_hash, parser,
                user_edited, note, tags, updated_at)
              VALUES (
                ${t.id}, ${this.userId}, ${t.account_ref}, ${t.provider}, ${t.external_ref ?? null}, ${t.type}, ${t.direction},
                ${t.amount_cents}, ${t.fee_cents}, ${t.balance_after_cents ?? null}, ${t.occurred_at}, ${t.received_at},
                ${sp.json(t.counterparty as never)}, ${t.category_id ?? null}, ${t.category_source}, ${t.category_confidence ?? null},
                ${t.is_transfer}, ${t.transfer_pair_id ?? null}, ${t.parse_confidence}, ${t.source}, ${t.raw_hash},
                ${sp.json(t.parser as never)}, ${t.user_edited}, ${t.note ?? null}, ${sp.json((t.tags ?? []) as never)}, ${t.updated_at})
              ON CONFLICT (id) DO UPDATE SET
                account_ref = EXCLUDED.account_ref, provider = EXCLUDED.provider, external_ref = EXCLUDED.external_ref,
                type = EXCLUDED.type, direction = EXCLUDED.direction, amount_cents = EXCLUDED.amount_cents,
                fee_cents = EXCLUDED.fee_cents, balance_after_cents = EXCLUDED.balance_after_cents,
                occurred_at = EXCLUDED.occurred_at, received_at = EXCLUDED.received_at, counterparty = EXCLUDED.counterparty,
                category_id = EXCLUDED.category_id, category_source = EXCLUDED.category_source,
                category_confidence = EXCLUDED.category_confidence, is_transfer = EXCLUDED.is_transfer,
                transfer_pair_id = EXCLUDED.transfer_pair_id, parse_confidence = EXCLUDED.parse_confidence,
                source = EXCLUDED.source, raw_hash = EXCLUDED.raw_hash, parser = EXCLUDED.parser,
                user_edited = EXCLUDED.user_edited, note = EXCLUDED.note, tags = EXCLUDED.tags,
                updated_at = EXCLUDED.updated_at, synced_at = now()
              WHERE transactions.user_id = ${this.userId} AND EXCLUDED.updated_at > transactions.updated_at
              RETURNING id`;
            if (rows.length === 0) {
              // Either stale (older updated_at) or the id belongs to someone else; both are "not applied".
              const mine = await sp`SELECT 1 FROM transactions WHERE id = ${t.id} AND user_id = ${this.userId}`;
              if (mine.length === 0) throw new Error('conflict');
              accepted += 1; // already stored, newer or equal: idempotent success
            } else {
              accepted += 1;
            }
          });
        } catch (err) {
          const code = (err as postgres.PostgresError).code;
          const reason = code === '23505' ? 'duplicate_reference' : (err as Error).message === 'conflict' ? 'conflict' : 'invalid';
          rejected.push({ id: t.id, reason });
        }
      }
    });
    return { accepted, rejected };
  }

  async listTransactions(window: TransactionWindow): Promise<TransactionRow[]> {
    const rows = await this.tx(
      (tx) => tx`SELECT * FROM transactions WHERE user_id = ${this.userId}
        AND occurred_at >= ${window.from} AND occurred_at < ${window.to} ORDER BY occurred_at, id`,
    );
    return rows.map((r) => mapTransaction(r as Row));
  }

  async countTransactions(): Promise<number> {
    const rows = await this.tx((tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM transactions WHERE user_id = ${this.userId}`);
    return rows[0]?.n ?? 0;
  }

  /** Transactions inside `window` that were synced after `since` (late arrivals for a report). */
  async countLateArrivals(window: TransactionWindow, since: string): Promise<number> {
    const rows = await this.tx(
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM transactions WHERE user_id = ${this.userId}
        AND occurred_at >= ${window.from} AND occurred_at < ${window.to} AND synced_at > ${since}`,
    );
    return rows[0]?.n ?? 0;
  }

  // ----- budgets and categories -----

  async listBudgets(): Promise<BudgetRow[]> {
    const rows = await this.tx((tx) => tx`SELECT id, category_id, period, limit_cents FROM budgets WHERE user_id = ${this.userId}`);
    return rows.map((r) => ({
      id: r['id'] as string,
      category_id: r['category_id'] as string,
      period: r['period'] as ReportKind,
      limit_cents: r['limit_cents'] as number,
    }));
  }

  async upsertBudget(b: { category_id: string; period: ReportKind; limit_cents: number }): Promise<void> {
    await this.tx(
      (tx) => tx`INSERT INTO budgets (user_id, category_id, period, limit_cents) VALUES (${this.userId}, ${b.category_id}, ${b.period}, ${b.limit_cents})
        ON CONFLICT (user_id, category_id, period) DO UPDATE SET limit_cents = EXCLUDED.limit_cents WHERE budgets.user_id = ${this.userId}`,
    );
  }

  async listCategories(): Promise<CategoryRow[]> {
    const rows = await this.tx((tx) => tx`SELECT category_id, parent_id, name_en, name_sw, kind FROM categories WHERE user_id = ${this.userId}`);
    return rows.map((r) => ({
      category_id: r['category_id'] as string,
      parent_id: (r['parent_id'] as string | null) ?? null,
      name_en: r['name_en'] as string,
      name_sw: r['name_sw'] as string,
      kind: r['kind'] as string,
    }));
  }

  async upsertCategories(cats: readonly CategoryRow[]): Promise<void> {
    if (cats.length === 0) return;
    await this.tx(async (tx) => {
      for (const c of cats) {
        await tx`INSERT INTO categories (user_id, category_id, parent_id, name_en, name_sw, kind)
          VALUES (${this.userId}, ${c.category_id}, ${c.parent_id}, ${c.name_en}, ${c.name_sw}, ${c.kind})
          ON CONFLICT (user_id, category_id) DO UPDATE SET parent_id = EXCLUDED.parent_id, name_en = EXCLUDED.name_en,
            name_sw = EXCLUDED.name_sw, kind = EXCLUDED.kind WHERE categories.user_id = ${this.userId}`;
      }
    });
  }

  // ----- reports -----

  async findReport(kind: ReportKind, periodStart: string): Promise<ReportRow | null> {
    const rows = await this.tx(
      (tx) => tx`SELECT * FROM reports WHERE user_id = ${this.userId} AND kind = ${kind} AND period_start = ${periodStart}`,
    );
    return rows[0] ? mapReport(rows[0] as Row) : null;
  }

  /** Creates the report row for (kind, period_start) or returns the existing one (idempotent). */
  async ensureReport(kind: ReportKind, periodStart: string, periodEnd: string): Promise<ReportRow> {
    await this.tx(
      (tx) => tx`INSERT INTO reports (user_id, kind, period_start, period_end)
        VALUES (${this.userId}, ${kind}, ${periodStart}, ${periodEnd})
        ON CONFLICT (user_id, kind, period_start) DO NOTHING`,
    );
    const r = await this.findReport(kind, periodStart);
    if (!r) throw new Error('report row vanished');
    return r;
  }

  async getReport(reportId: string): Promise<ReportRow | null> {
    const rows = await this.tx((tx) => tx`SELECT * FROM reports WHERE user_id = ${this.userId} AND id = ${reportId}`);
    return rows[0] ? mapReport(rows[0] as Row) : null;
  }

  async listReports(kind?: ReportKind): Promise<ReportRow[]> {
    const rows = await this.tx((tx) =>
      kind
        ? tx`SELECT * FROM reports WHERE user_id = ${this.userId} AND kind = ${kind} ORDER BY period_start DESC`
        : tx`SELECT * FROM reports WHERE user_id = ${this.userId} ORDER BY period_start DESC`,
    );
    return rows.map((r) => mapReport(r as Row));
  }

  async updateReport(reportId: string, patch: ReportPatch): Promise<ReportRow> {
    await this.tx(
      (tx) => tx`UPDATE reports SET
        status = COALESCE(${patch.status ?? null}, status),
        writer = COALESCE(${patch.writer ?? null}, writer),
        facts_json = CASE WHEN ${patch.facts_json !== undefined} THEN ${patch.facts_json === undefined ? null : tx.json(patch.facts_json as never)} ELSE facts_json END,
        document_json = CASE WHEN ${patch.document_json !== undefined} THEN ${patch.document_json === undefined ? null : tx.json(patch.document_json as never)} ELSE document_json END,
        artefacts = COALESCE(${patch.artefacts ? tx.json(patch.artefacts as never) : null}, artefacts),
        input_tokens = COALESCE(${patch.input_tokens ?? null}, input_tokens),
        output_tokens = COALESCE(${patch.output_tokens ?? null}, output_tokens),
        cost_usd = COALESCE(${patch.cost_usd ?? null}, cost_usd),
        last_error = CASE WHEN ${patch.last_error !== undefined} THEN ${patch.last_error ?? null} ELSE last_error END,
        generated_at = CASE WHEN ${patch.generated_at !== undefined} THEN ${patch.generated_at ?? null} ELSE generated_at END,
        updated_at = now()
      WHERE user_id = ${this.userId} AND id = ${reportId}`,
    );
    const r = await this.getReport(reportId);
    if (!r) throw new Error('report not found');
    return r;
  }

  /** Resets a report so it can be regenerated (`force`). Deliveries are kept as history but reset to pending. */
  async resetReport(reportId: string): Promise<void> {
    await this.tx(async (tx) => {
      await tx`UPDATE reports SET status = 'queued', writer = 'pending', facts_json = NULL, document_json = NULL,
        artefacts = '{}'::jsonb, last_error = NULL, generated_at = NULL, updated_at = now()
        WHERE user_id = ${this.userId} AND id = ${reportId}`;
      await tx`DELETE FROM insights WHERE user_id = ${this.userId} AND report_id = ${reportId}`;
    });
  }

  async insertInsights(
    reportId: string,
    items: readonly { insight_id: string; kind: string; severity: string; payload: unknown; drilldown?: unknown; selected: boolean }[],
  ): Promise<void> {
    await this.tx(async (tx) => {
      await tx`DELETE FROM insights WHERE user_id = ${this.userId} AND report_id = ${reportId}`;
      for (const i of items) {
        await tx`INSERT INTO insights (user_id, report_id, insight_id, kind, severity, payload, drilldown, selected)
          VALUES (${this.userId}, ${reportId}, ${i.insight_id}, ${i.kind}, ${i.severity}, ${tx.json(i.payload as never)},
                  ${i.drilldown === undefined ? null : tx.json(i.drilldown as never)}, ${i.selected})`;
      }
    });
  }

  // ----- deliveries -----

  /** One delivery chain per (report, channel); returns the existing row when present. */
  async ensureDelivery(reportId: string, channel: Channel): Promise<DeliveryRow> {
    await this.tx(
      (tx) => tx`INSERT INTO deliveries (user_id, report_id, channel) VALUES (${this.userId}, ${reportId}, ${channel})
        ON CONFLICT (report_id, channel) DO NOTHING`,
    );
    const rows = await this.tx((tx) => tx`SELECT * FROM deliveries WHERE user_id = ${this.userId} AND report_id = ${reportId} AND channel = ${channel}`);
    const row = rows[0];
    if (!row) throw new Error('delivery row vanished');
    return mapDelivery(row as Row);
  }

  async listDeliveries(reportId: string): Promise<DeliveryRow[]> {
    const rows = await this.tx((tx) => tx`SELECT * FROM deliveries WHERE user_id = ${this.userId} AND report_id = ${reportId} ORDER BY channel`);
    return rows.map((r) => mapDelivery(r as Row));
  }

  async updateDelivery(deliveryId: string, patch: DeliveryPatch): Promise<DeliveryRow> {
    const rows = await this.tx(
      (tx) => tx`UPDATE deliveries SET
        status = COALESCE(${patch.status ?? null}, status),
        provider_message_id = CASE WHEN ${patch.provider_message_id !== undefined} THEN ${patch.provider_message_id ?? null} ELSE provider_message_id END,
        last_error = CASE WHEN ${patch.last_error !== undefined} THEN ${patch.last_error ?? null} ELSE last_error END,
        cost_usd = COALESCE(${patch.cost_usd ?? null}, cost_usd),
        attempts = attempts + ${patch.bump_attempts ? 1 : 0},
        updated_at = now()
      WHERE user_id = ${this.userId} AND id = ${deliveryId} RETURNING *`,
    );
    const row = rows[0];
    if (!row) throw new Error('delivery not found');
    return mapDelivery(row as Row);
  }

  // ----- report links -----

  async createReportLink(reportId: string, tokenHash: string, expiresAt: string): Promise<ReportLinkRow> {
    const rows = await this.tx(
      (tx) => tx`INSERT INTO report_links (user_id, report_id, token_hash, expires_at)
        VALUES (${this.userId}, ${reportId}, ${tokenHash}, ${expiresAt}) RETURNING id, user_id, report_id, expires_at, revoked_at`,
    );
    const r = rows[0] as Row;
    return {
      id: r['id'] as string,
      user_id: r['user_id'] as string,
      report_id: r['report_id'] as string,
      expires_at: isoReq(r['expires_at'] as Date),
      revoked_at: iso(r['revoked_at'] as Date | null),
    };
  }

  // ----- audit and AI usage -----

  async audit(actor: string, action: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.tx((tx) => tx`INSERT INTO audit_log (user_id, actor, action, details) VALUES (${this.userId}, ${actor}, ${action}, ${tx.json(details as never)})`);
  }

  async recordAiUsage(e: AiUsageEntry): Promise<void> {
    await this.tx(
      (tx) => tx`INSERT INTO ai_usage (user_id, report_id, step, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd)
        VALUES (${this.userId}, ${e.report_id ?? null}, ${e.step}, ${e.model}, ${e.input_tokens}, ${e.output_tokens},
                ${e.cache_read ?? 0}, ${e.cache_write ?? 0}, ${e.cost_usd})`,
    );
  }
}
