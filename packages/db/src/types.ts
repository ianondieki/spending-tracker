import type { Account, Transaction } from '@hesabu/analytics';

export type Locale = 'en' | 'sw';
export type WeekStart = 'monday' | 'sunday';
export type Channel = 'email' | 'whatsapp' | 'share';
export type ReportKind = 'weekly' | 'monthly';
export type ReportStatus = 'queued' | 'collecting' | 'writing' | 'checking' | 'rendering' | 'delivering' | 'done' | 'failed';
export type Writer = 'model' | 'fallback' | 'pending';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
export type ConsentPurpose = 'sms_access' | 'sync' | 'ai_fallback' | 'whatsapp_delivery' | 'email_delivery';

export interface Preferences {
  email: string | null;
  whatsapp_e164: string | null;
  locale: Locale;
  week_start: WeekStart;
  weekly_at: string;
  monthly_at: string;
  channels: Channel[];
  theme: 'light' | 'dark' | 'system';
}

export interface UserRow extends Preferences {
  id: string;
  phone_e164: string | null;
  display_name: string | null;
  created_at: string;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  device_id: string;
  platform: string;
  app_version: string;
  display_name: string | null;
  last_seen_at: string;
}

export interface AccountRow extends Account {
  id: string;
}

export type TransactionRow = Transaction & { synced_at: string };

export interface BudgetRow {
  id: string;
  category_id: string;
  period: ReportKind;
  limit_cents: number;
}

export interface CategoryRow {
  category_id: string;
  parent_id: string | null;
  name_en: string;
  name_sw: string;
  kind: string;
}

export interface ReportArtefacts {
  hero_png_key?: string | null;
  pdf_key?: string | null;
  html_key?: string | null;
  chart_keys?: Record<string, string>;
  hero_png_url?: string | null;
  pdf_url?: string | null;
  web_url?: string | null;
}

export interface ReportRow {
  id: string;
  user_id: string;
  kind: ReportKind;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  writer: Writer;
  facts_json: unknown | null;
  document_json: unknown | null;
  artefacts: ReportArtefacts;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  last_error: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRow {
  id: string;
  report_id: string;
  channel: Channel;
  status: DeliveryStatus;
  provider_message_id: string | null;
  attempts: number;
  last_error: string | null;
  cost_usd: number;
  updated_at: string;
}

export interface ReportLinkRow {
  id: string;
  user_id: string;
  report_id: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AiUsageEntry {
  report_id?: string | null;
  step: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read?: number;
  cache_write?: number;
  cost_usd: number;
}

export interface SyncOutcome {
  accepted: number;
  rejected: { id: string; reason: string }[];
}
