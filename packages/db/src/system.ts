/**
 * The few operations that legitimately run before or across tenants: device registration (no user
 * yet), the scheduler (every user), provider webhooks (keyed by provider message id), the public
 * report-link resolver (keyed by token hash) and the global AI spend cap. Each returns a tenant
 * handle or a user id so the caller continues through `TenantDb`.
 */
import type { Sql, TransactionSql } from './client.js';
import { TenantDb } from './tenant.js';
import type { Channel, DeliveryStatus, Locale, ReportLinkRow, WeekStart } from './types.js';

export interface RegisterDeviceInput {
  device_id: string;
  platform: string;
  app_version: string;
  display_name?: string | null;
}

export interface RegisteredDevice {
  user_id: string;
  device_row_id: string;
  created_user: boolean;
}

export interface ScheduleUser {
  user_id: string;
  locale: Locale;
  week_start: WeekStart;
  weekly_at: string;
  monthly_at: string;
  channels: Channel[];
}

export class SystemDb {
  constructor(private readonly sql: Sql) {}

  private tx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.role', 'system', true)`;
      return fn(tx);
    }) as Promise<T>;
  }

  /** Finds the user owning `device_id`, or creates a fresh user for a new device (single-user sprint auth). */
  async registerDevice(input: RegisterDeviceInput): Promise<RegisteredDevice> {
    return this.tx(async (tx) => {
      const existing = await tx<{ id: string; user_id: string }[]>`SELECT id, user_id FROM devices WHERE device_id = ${input.device_id}`;
      const found = existing[0];
      if (found) {
        await tx`UPDATE devices SET platform = ${input.platform}, app_version = ${input.app_version},
          display_name = COALESCE(${input.display_name ?? null}, display_name), last_seen_at = now() WHERE id = ${found.id}`;
        return { user_id: found.user_id, device_row_id: found.id, created_user: false };
      }
      const users = await tx<{ id: string }[]>`INSERT INTO users (id, user_id, display_name)
        SELECT u, u, ${input.display_name ?? null} FROM (SELECT gen_random_uuid() AS u) s RETURNING id`;
      const userId = users[0]?.id;
      if (!userId) throw new Error('failed to create user');
      const devices = await tx<{ id: string }[]>`INSERT INTO devices (user_id, device_id, platform, app_version, display_name)
        VALUES (${userId}, ${input.device_id}, ${input.platform}, ${input.app_version}, ${input.display_name ?? null}) RETURNING id`;
      await tx`INSERT INTO audit_log (user_id, actor, action, details) VALUES (${userId}, ${'device:' + input.device_id}, 'device.registered', ${tx.json({ platform: input.platform })})`;
      return { user_id: userId, device_row_id: devices[0]?.id ?? '', created_user: true };
    });
  }

  /** Every user with their schedule preferences (the scheduler runs over all tenants). */
  async listUsersForScheduling(): Promise<ScheduleUser[]> {
    const rows = await this.tx((tx) => tx`SELECT id, locale, week_start, weekly_at, monthly_at, channels FROM users ORDER BY created_at`);
    return rows.map((r) => ({
      user_id: r['id'] as string,
      locale: r['locale'] as Locale,
      week_start: r['week_start'] as WeekStart,
      weekly_at: r['weekly_at'] as string,
      monthly_at: r['monthly_at'] as string,
      channels: r['channels'] as Channel[],
    }));
  }

  /** Resolves a report link by token hash; null when unknown, expired or revoked. */
  async resolveReportLink(tokenHash: string, now: Date = new Date()): Promise<ReportLinkRow | null> {
    const rows = await this.tx(
      (tx) => tx`SELECT id, user_id, report_id, expires_at, revoked_at FROM report_links
        WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > ${now}`,
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r['id'] as string,
      user_id: r['user_id'] as string,
      report_id: r['report_id'] as string,
      expires_at: (r['expires_at'] as Date).toISOString(),
      revoked_at: null,
    };
  }

  /** Provider webhooks only know the provider message id. Returns the owning user id, or null when unknown. */
  async updateDeliveryByProviderMessageId(
    providerMessageId: string,
    status: DeliveryStatus,
    lastError: string | null = null,
  ): Promise<{ user_id: string; report_id: string } | null> {
    const rows = await this.tx(
      (tx) => tx`UPDATE deliveries SET status = ${status}, last_error = ${lastError}, updated_at = now()
        WHERE provider_message_id = ${providerMessageId} RETURNING user_id, report_id`,
    );
    const r = rows[0];
    return r ? { user_id: r['user_id'] as string, report_id: r['report_id'] as string } : null;
  }

  /** A WhatsApp STOP/JOIN arrives with only the phone number. Returns the user id, or null. */
  async findUserByWhatsapp(e164: string): Promise<string | null> {
    const rows = await this.tx((tx) => tx<{ id: string }[]>`SELECT id FROM users WHERE whatsapp_e164 = ${e164} LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  async findUserByEmail(email: string): Promise<string | null> {
    const rows = await this.tx((tx) => tx<{ id: string }[]>`SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  /** Total model spend across all users since `since` (the daily USD cap is global). */
  async aiSpendUsdSince(since: Date): Promise<number> {
    const rows = await this.tx((tx) => tx<{ total: string | null }[]>`SELECT sum(cost_usd)::text AS total FROM ai_usage WHERE created_at >= ${since}`);
    return Number(rows[0]?.total ?? 0);
  }

  forUser(userId: string): TenantDb {
    return new TenantDb(this.sql, userId);
  }
}
