-- Contract change (PROVIDER-PACKS.md, 13:36 UTC): the dedupe key is (provider, external_ref, family_id) because
-- M-Pesa reuses one code across related messages (a Fuliza drawdown carries the payment's code; reversals cite it).
DROP INDEX IF EXISTS transactions_user_provider_ref_uidx;
CREATE UNIQUE INDEX transactions_user_provider_ref_family_uidx
  ON transactions (user_id, provider, external_ref, (parser->>'family_id')) WHERE external_ref IS NOT NULL;
