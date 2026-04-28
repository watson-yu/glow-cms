-- Migration: Add generation_jobs table for tracking async variable generation
-- Issue #54

CREATE TABLE IF NOT EXISTS generation_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_id INT NOT NULL,
  status ENUM('pending','running','completed','failed') DEFAULT 'pending',
  sections_total INT DEFAULT 0,
  sections_done INT DEFAULT 0,
  error TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT fk_gj_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);
