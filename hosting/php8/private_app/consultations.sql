CREATE TABLE IF NOT EXISTS consultation_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(20) NOT NULL,
  grade VARCHAR(20) NULL,
  applicant_name VARCHAR(80) NOT NULL,
  contact VARCHAR(80) NOT NULL,
  target VARCHAR(160) NULL,
  consultation_mode VARCHAR(20) NOT NULL,
  preferred_time VARCHAR(120) NULL,
  message TEXT NOT NULL,
  consent TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'received',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consultations_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
