-- Password reset via OTP code (sent by email)
-- One active row per user at a time (older rows are marked consumed when a new one is created)

CREATE TABLE IF NOT EXISTS sec_password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
  -- bcrypt hash of the numeric OTP code
  code_hash TEXT NOT NULL,
  -- sha256 hash of the short-lived reset token issued after verify
  reset_token_hash TEXT NULL,
  reset_token_expires_at TIMESTAMPTZ NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  ip_address INET NULL,
  user_agent TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_password_reset_codes_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS sec_password_reset_codes_user_id_idx
  ON sec_password_reset_codes(user_id);

CREATE INDEX IF NOT EXISTS sec_password_reset_codes_expires_at_idx
  ON sec_password_reset_codes(expires_at);

-- Only one active (not consumed, not expired) code per user
CREATE UNIQUE INDEX IF NOT EXISTS sec_password_reset_codes_active_uniq
  ON sec_password_reset_codes(user_id)
  WHERE consumed_at IS NULL;
