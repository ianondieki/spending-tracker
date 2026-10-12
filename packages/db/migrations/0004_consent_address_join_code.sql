-- B1/M2 (security review): a delivery consent is proof for ONE address, and a WhatsApp number belongs to one user.
ALTER TABLE consents ADD COLUMN address text;                      -- the address the consent was proven for (E.164 or lower-cased email)

-- Per-user random join code: the inbound "JOIN <code>" message proves the sender's number and names the user.
ALTER TABLE users ADD COLUMN join_code text NOT NULL DEFAULT upper(encode(gen_random_bytes(4), 'hex'));
CREATE UNIQUE INDEX users_join_code_uidx ON users(join_code);

-- A number proven by JOIN can belong to one account only. Sprint databases may hold duplicates from demo seeding:
-- keep the newest row's number, clear the rest (no consent existed for them that this migration would honour).
UPDATE users u SET whatsapp_e164 = NULL
WHERE whatsapp_e164 IS NOT NULL
  AND EXISTS (SELECT 1 FROM users o WHERE o.whatsapp_e164 = u.whatsapp_e164 AND o.created_at > u.created_at);
CREATE UNIQUE INDEX users_whatsapp_e164_uidx ON users(whatsapp_e164) WHERE whatsapp_e164 IS NOT NULL;

-- Magic-link email confirmation: the token itself is never stored, only its hash.
CREATE TABLE email_confirmations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_confirmations USING (user_id::text = current_setting('app.user_id', true))
  WITH CHECK (user_id::text = current_setting('app.user_id', true));
CREATE POLICY system_access ON email_confirmations USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- Existing consents without an address cannot be honoured any more (fail closed): revoke them. The demo seed
-- re-grants with the address it sets.
UPDATE consents SET revoked_at = now()
WHERE purpose IN ('whatsapp_delivery', 'email_delivery') AND revoked_at IS NULL AND address IS NULL;
