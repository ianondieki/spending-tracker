-- Hesabu schema, sprint v1. Every table carries user_id; the query layer (src/tenant.ts) only ever
-- queries through a tenant handle, and row-level security is enabled as a second line of defence for
-- any connection that sets `app.user_id` (see src/tenant.ts).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,                       -- always equals id; keeps "every table carries user_id" literal
  phone_e164    text,
  email         text,
  whatsapp_e164 text,
  display_name  text,
  locale        text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','sw')),
  week_start    text NOT NULL DEFAULT 'monday' CHECK (week_start IN ('monday','sunday')),
  timezone      text NOT NULL DEFAULT 'Africa/Nairobi' CHECK (timezone = 'Africa/Nairobi'),
  weekly_at     text NOT NULL DEFAULT 'SUN 19:30',
  monthly_at    text NOT NULL DEFAULT '1 07:30',
  channels      jsonb NOT NULL DEFAULT '["share"]'::jsonb,
  theme         text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id = id)
);

CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id    text NOT NULL UNIQUE,
  platform     text NOT NULL,
  app_version  text NOT NULL,
  display_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_idx ON devices(user_id);

CREATE TABLE consents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('sms_access','sync','ai_fallback','whatsapp_delivery','email_delivery')),
  version    text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX consents_user_purpose_idx ON consents(user_id, purpose);

CREATE TABLE accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_ref       text NOT NULL,
  provider          text NOT NULL,
  institution       text,
  label             text NOT NULL,
  mask              text,
  currency          text NOT NULL DEFAULT 'KES',
  last_balance_cents bigint,
  last_balance_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_ref)
);

CREATE TABLE transactions (
  id                  uuid PRIMARY KEY,                 -- generated on device
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_ref         text NOT NULL,
  provider            text NOT NULL,
  external_ref        text,
  type                text NOT NULL,
  direction           text NOT NULL CHECK (direction IN ('in','out','none')),
  amount_cents        bigint NOT NULL,
  fee_cents           bigint NOT NULL DEFAULT 0,
  balance_after_cents bigint,
  occurred_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL,
  counterparty        jsonb NOT NULL,
  category_id         text,
  category_source     text NOT NULL DEFAULT 'none',
  category_confidence double precision,
  is_transfer         boolean NOT NULL DEFAULT false,
  transfer_pair_id    uuid,
  parse_confidence    double precision NOT NULL,
  source              text NOT NULL,
  raw_hash            text NOT NULL,
  parser              jsonb NOT NULL,
  user_edited         boolean NOT NULL DEFAULT false,
  note                text,
  tags                jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at          timestamptz NOT NULL,
  synced_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_occurred_idx ON transactions(user_id, occurred_at);
CREATE INDEX transactions_user_synced_idx ON transactions(user_id, synced_at);
-- One ledger row per provider reference, else per message hash (master prompt §5).
CREATE UNIQUE INDEX transactions_user_provider_ref_uidx ON transactions(user_id, provider, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX transactions_user_raw_hash_uidx ON transactions(user_id, raw_hash) WHERE external_ref IS NULL;

CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id text NOT NULL,                           -- taxonomy id or a user-created id
  parent_id  text,
  name_en    text NOT NULL,
  name_sw    text NOT NULL,
  kind       text NOT NULL DEFAULT 'spend',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);

CREATE TABLE merchants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  aliases          jsonb NOT NULL DEFAULT '[]'::jsonb,
  paybill          text,
  till             text,
  default_category text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern     jsonb NOT NULL,
  category_id text NOT NULL,
  precedence  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rules_user_idx ON rules(user_id);

CREATE TABLE budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  period      text NOT NULL CHECK (period IN ('weekly','monthly')),
  limit_cents bigint NOT NULL CHECK (limit_cents >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id, period)
);

CREATE TABLE recurrences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant      text NOT NULL,
  category_id   text,
  cadence       text NOT NULL,
  typical_cents bigint NOT NULL,
  last_paid     timestamptz NOT NULL,
  next_expected timestamptz,
  confidence    double precision NOT NULL,
  is_subscription boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant)
);

CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('weekly','monthly')),
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','collecting','writing','checking','rendering','delivering','done','failed')),
  writer        text NOT NULL DEFAULT 'pending' CHECK (writer IN ('model','fallback','pending')),
  facts_json    jsonb,
  document_json jsonb,
  artefacts     jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {hero_png_key, pdf_key, html_key, chart_keys:{}}
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL DEFAULT 0,
  last_error    text,
  generated_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, period_start)
);

CREATE TABLE deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id           uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  channel             text NOT NULL CHECK (channel IN ('email','whatsapp','share')),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','sent','delivered','read','failed','skipped')),
  provider_message_id text,
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  cost_usd            numeric(10,6) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, channel)
);
CREATE INDEX deliveries_provider_msg_idx ON deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE insights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  insight_id text NOT NULL,
  kind       text NOT NULL,
  severity   text NOT NULL,
  payload    jsonb NOT NULL,
  drilldown  jsonb,
  selected   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insights_report_idx ON insights(report_id);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  actor      text NOT NULL,                              -- 'device:<id>' | 'worker' | 'webhook:<provider>' | 'system'
  action     text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,         -- never raw message text, never PII
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_idx ON audit_log(user_id, created_at);

CREATE TABLE report_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,                       -- sha256 of the signed token; the token itself is never stored
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_usage (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL,
  report_id     uuid,
  step          text NOT NULL,
  model         text NOT NULL,
  input_tokens  integer NOT NULL,
  output_tokens integer NOT NULL,
  cache_read    integer NOT NULL DEFAULT 0,
  cache_write   integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_created_idx ON ai_usage(created_at);

-- Row-level security, second line of defence: a connection that sets `app.user_id` sees only that tenant.
-- (Superusers bypass RLS; the application role in production is not a superuser.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','devices','consents','accounts','transactions','categories','merchants','rules',
                           'budgets','recurrences','reports','deliveries','insights','audit_log','report_links','ai_usage']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (user_id::text = current_setting(''app.user_id'', true)) ' ||
      'WITH CHECK (user_id::text = current_setting(''app.user_id'', true))', t);
    -- System operations (registration, scheduling, webhooks) run with app.role = system.
    EXECUTE format(
      'CREATE POLICY system_access ON %I USING (current_setting(''app.role'', true) = ''system'') ' ||
      'WITH CHECK (current_setting(''app.role'', true) = ''system'')', t);
  END LOOP;
END $$;
