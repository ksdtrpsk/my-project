CREATE TABLE IF NOT EXISTS app_sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 role ENUM('student','admin') NOT NULL,
 account_id INT UNSIGNED NOT NULL,
 credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at BIGINT UNSIGNED NOT NULL,
 INDEX idx_session_account (role, account_id),
 INDEX idx_session_expiry (expires_at)
) ENGINE=InnoDB;
