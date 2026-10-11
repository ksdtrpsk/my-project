CREATE TABLE IF NOT EXISTS announcements (
    announcement_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    content TEXT NOT NULL,
    created_by INT UNSIGNED NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT uq_announcements_request UNIQUE (request_id),
    KEY idx_announcements_created (created_at, announcement_id),
    CONSTRAINT fk_announcements_admin FOREIGN KEY (created_by)
        REFERENCES admins (admin_id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_announcements_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
    CONSTRAINT chk_announcements_content CHECK (CHAR_LENGTH(TRIM(content)) BETWEEN 1 AND 5000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
