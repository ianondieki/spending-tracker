/**
 * The few operations that legitimately run before or across tenants: device registration (no user
 * yet), the scheduler (every user), provider webhooks (keyed by provider message id), the public
 * report-link resolver (keyed by token hash) and the global AI spend cap. Each returns a tenant
 * handle or a user id so the caller continues through `TenantDb`.
 */
import type { Sql, TransactionSql } from './client.js';
import { TenantDb } from './tenant.js';
import { hashDeviceId } from './tokens.js';
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

export class DeviceRevokedError extends Error {
  constructor() {
    super('device revoked');
  }
}

export class SystemDb {
  constructor(private readonly sql: Sql) {}

  private tx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.role', 'system', true)`;
      return fn(tx);
    }) as Promise<T>;
  }

  /**
   * Finds the user owning this device (by the SHA-256 of its secret id), or creates a fresh user for a new device
   * (single-user sprint auth). A revoked device is refused: the row stays, the credential no longer works.
   */
  async registerDevice(input: RegisterDeviceInput): Promise<RegisteredDevice> {
    const hash = hashDeviceId(input.device_id);
    return this.tx(async (tx) => {
      const existing = await tx<{ id: string; user_id: string; revoked_at: Date | null }[]>`SELECT id, user_id, revoked_at FROM devices WHERE device_id = ${hash}`;
      const found = existing[0];
      if (found) {
        if (found.revoked_at) throw new DeviceRevokedError();
        await tx`UPDATE devices SET platform = ${input.platform}, app_version = ${input.app_version},
          display_name = COALESCE(${input.display_name ?? null}, display_name), last_seen_at = now() WHERE id = ${found.id}`;
        return { user_id: found.user_id, device_row_id: found.id, created_user: false };
      }
      const users = await tx<{ id: string }[]>`INSERT INTO users (id, user_id, display_name)
        SELECT u, u, ${input.display_name ?? null} FROM (SELECT gen_random_uuid() AS u) s RETURNING id`;
      const userId = users[0]?.id;
      if (!userId) throw new Error('failed to create user');
      const devices = await tx<{ id: string }[]>`INSERT INTO devices (user_id, device_id, platform, app_version, display_name)
        VALUES (${userId}, ${hash}, ${input.platform}, ${input.app_version}, ${input.display_name ?? null}) RETURNING id`;
      const rowId = devices[0]?.id ?? '';
      await tx`INSERT INTO audit_log (user_id, actor, action, details) VALUES (${userId}, ${'device:' + rowId}, 'device.registered', ${tx.json({ platform: input.platform })})`;
      return { user_id: userId, device_row_id: rowId, created_user: true };
    });
  }

  /** True when the device row exists, belongs to `userId` and is not revoked (checked on every authenticated request, M3). */
  async deviceIsActive(deviceRowId: string, userId: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(deviceRowId)) return false;
    const rows = await this.tx((tx) => tx`SELECT 1 FROM devices WHERE id = ${deviceRowId} AND user_id = ${userId} AND revoked_at IS NULL`);
    return rows.length > 0;
  }

  /** Revokes a device: its tokens stop working at the next request and it cannot re-register. */
  async revokeDevice(deviceRowId: string): Promise<boolean> {
    const rows = await this.tx((tx) => tx`UPDATE devices SET revoked_at = now() WHERE id = ${deviceRowId} AND revoked_at IS NULL RETURNING id`);
    return rows.length > 0;
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

  /** A WhatsApp STOP arrives with only the phone number; the number is unique, so at most one user owns it. */
  async findUserByWhatsapp(e164: string): Promise<string | null> {
    const rows = await this.tx((tx) => tx<{ id: string }[]>`SELECT id FROM users WHERE whatsapp_e164 = ${e164}`);
    return rows[0]?.id ?? null;
  }

  /** "JOIN <code>": the code names the user; the sender's number is what gets proven. */
  async findUserByJoinCode(code: string): Promise<string | null> {
    const rows = await this.tx((tx) => tx<{ id: string }[]>`SELECT id FROM users WHERE join_code = ${code.trim().toUpperCase()}`);
    return rows[0]?.id ?? null;
  }

  /**
   * Binds a number proven by a JOIN message to `userId` and grants the whatsapp_delivery consent for exactly that
   * number. Any other account that had typed the same number loses it (it was never proven there).
   */
  async bindVerifiedWhatsapp(userId: string, e164: string): Promise<void> {
    await this.tx(async (tx) => {
      const others = await tx<{ id: string }[]>`UPDATE users SET whatsapp_e164 = NULL, updated_at = now() WHERE whatsapp_e164 = ${e164} AND id <> ${userId} RETURNING id`;
      for (const o of others) {
        await tx`UPDATE consents SET revoked_at = now() WHERE user_id = ${o.id} AND purpose = 'whatsapp_delivery' AND revoked_at IS NULL`;
        await tx`INSERT INTO audit_log (user_id, actor, action, details) VALUES (${o.id}, 'webhook:whatsapp', 'whatsapp.number_claimed_elsewhere', '{}'::jsonb)`;
      }
      await tx`UPDATE users SET whatsapp_e164 = ${e164}, updated_at = now() WHERE id = ${userId}`;
      await tx`UPDATE consents SET revoked_at = now() WHERE user_id = ${userId} AND purpose = 'whatsapp_delivery' AND revoked_at IS NULL`;
      await tx`INSERT INTO consents (user_id, purpose, version, address) VALUES (${userId}, 'whatsapp_delivery', '1', ${e164})`;
      await tx`INSERT INTO audit_log (user_id, actor, action, details) VALUES (${userId}, 'webhook:whatsapp', 'consent.granted', ${tx.json({ purpose: 'whatsapp_delivery', verified: true })})`;
    });
  }

  /**
   * Redeems a magic-link token (by hash): marks it used, sets the user's email to the confirmed address and grants
   * email_delivery for exactly that address. Null when unknown, expired or already used.
   */
  async confirmEmailToken(tokenHash: string, now: Date = new Date()): Promise<{ user_id: string; email: string } | null> {
    return this.tx(async (tx) => {
      const rows = await tx<{ id: string; user_id: string; email: string }[]>`UPDATE email_confirmations SET used_at = now()
        WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > ${now} RETURNING id, user_id, email`;
      const r = rows[0];
      if (!r) return null;
      await tx`UPDATE users SET email = ${r.email}, updated_at = now() WHERE id = ${r.user_id}`;
      await tx`UPDATE consents SET revoked_at = now() WHERE user_id = ${r.user_id} AND purpose = 'email_delivery' AND revoked_at IS NULL`;
      await tx`INSERT INTO consents (user_id, purpose, version, address) VALUES (${r.user_id}, 'email_delivery', '1', ${r.email})`;
      await tx`INSERT INTO audit_log (user_id, actor, action, details) VALUES (${r.user_id}, 'webhook:email-confirm', 'consent.granted', ${tx.json({ purpose: 'email_delivery', verified: true })})`;
      return { user_id: r.user_id, email: r.email };
    });
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
