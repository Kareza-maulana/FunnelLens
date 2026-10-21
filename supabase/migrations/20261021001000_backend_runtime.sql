-- Backend-only privileges. Never expose schema app or private through the Data API.
GRANT INSERT (auth_subject, display_name, is_owner) ON app.users TO fl_mvp_api;
GRANT UPDATE (display_name) ON app.users TO fl_mvp_api;
GRANT DELETE ON app.business_profile TO fl_mvp_api;
GRANT INSERT (provider, connector_kind, external_connection_id, status, credential_secret_ref, scopes, capabilities, verified_assets, token_expires_at, verified_at)
  ON app.integrations TO fl_mvp_api;
GRANT UPDATE (status, credential_secret_ref, scopes, capabilities, verified_assets, token_expires_at, verified_at, last_synced_at, updated_at)
  ON app.integrations TO fl_mvp_api;
GRANT USAGE ON SCHEMA extensions TO fl_mvp_api, fl_mvp_worker;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE private.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL UNIQUE REFERENCES app.integrations(id),
  ciphertext bytea NOT NULL,
  key_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.integration_secrets FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO fl_mvp_api, fl_mvp_worker;
GRANT SELECT, INSERT, UPDATE ON private.integration_secrets TO fl_mvp_api, fl_mvp_worker;
