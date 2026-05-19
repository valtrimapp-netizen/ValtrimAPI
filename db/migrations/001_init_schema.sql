CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS core_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT core_users_full_name_not_blank CHECK (length(trim(full_name)) > 0)
);

CREATE TABLE IF NOT EXISTS sec_auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NULL,
  password_hash TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_auth_identities_provider_chk CHECK (provider IN ('local', 'google')),
  CONSTRAINT sec_auth_identities_local_google_chk CHECK (
    (provider = 'local' AND password_hash IS NOT NULL AND provider_subject IS NULL)
    OR
    (provider = 'google' AND provider_subject IS NOT NULL AND password_hash IS NULL)
  ),
  CONSTRAINT sec_auth_identities_user_provider_uniq UNIQUE (user_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS sec_auth_identities_provider_subject_uniq
  ON sec_auth_identities(provider, provider_subject)
  WHERE provider_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS cat_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cat_roles_code_lower_chk CHECK (code = lower(code))
);

CREATE TABLE IF NOT EXISTS rel_user_roles (
  user_id UUID NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES cat_roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_user_id UUID NULL REFERENCES core_users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS rel_user_roles_role_id_idx ON rel_user_roles(role_id);

CREATE TABLE IF NOT EXISTS sec_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
  session_key_hash TEXT NOT NULL UNIQUE,
  device_name TEXT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_user_sessions_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS sec_user_sessions_user_id_idx ON sec_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS sec_user_sessions_expires_at_idx ON sec_user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS sec_user_sessions_revoked_at_idx ON sec_user_sessions(revoked_at);

CREATE TABLE IF NOT EXISTS sec_session_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sec_user_sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_jti UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  replaced_by_token_id UUID NULL REFERENCES sec_session_refresh_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_session_refresh_tokens_expiry_chk CHECK (expires_at > created_at),
  CONSTRAINT sec_session_refresh_tokens_consumed_chk CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS sec_session_refresh_tokens_session_id_idx ON sec_session_refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS sec_session_refresh_tokens_expires_at_idx ON sec_session_refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS sec_session_refresh_tokens_revoked_at_idx ON sec_session_refresh_tokens(revoked_at);

CREATE TABLE IF NOT EXISTS ops_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES core_users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ops_projects_status_chk CHECK (status IN ('active', 'archived')),
  CONSTRAINT ops_projects_name_not_blank_chk CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS ops_projects_owner_user_id_idx ON ops_projects(owner_user_id);
CREATE INDEX IF NOT EXISTS ops_projects_status_idx ON ops_projects(status);

CREATE TABLE IF NOT EXISTS evt_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID NULL REFERENCES core_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evt_audit_log_actor_user_id_idx ON evt_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS evt_audit_log_entity_idx ON evt_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS evt_audit_log_created_at_idx ON evt_audit_log(created_at DESC);

DROP TRIGGER IF EXISTS core_users_set_updated_at ON core_users;
CREATE TRIGGER core_users_set_updated_at
  BEFORE UPDATE ON core_users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS sec_auth_identities_set_updated_at ON sec_auth_identities;
CREATE TRIGGER sec_auth_identities_set_updated_at
  BEFORE UPDATE ON sec_auth_identities
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS sec_user_sessions_set_updated_at ON sec_user_sessions;
CREATE TRIGGER sec_user_sessions_set_updated_at
  BEFORE UPDATE ON sec_user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ops_projects_set_updated_at ON ops_projects;
CREATE TRIGGER ops_projects_set_updated_at
  BEFORE UPDATE ON ops_projects
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
