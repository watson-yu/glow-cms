-- Migration: Add blueprint support to page_templates
-- Issue #27
--
-- Written idempotently (information_schema guards + CREATE TABLE IF NOT EXISTS +
-- dynamic SQL for conditional ADD COLUMN/ADD CONSTRAINT, since MySQL lacks
-- ADD COLUMN/CONSTRAINT IF NOT EXISTS) so it is a no-op on databases — including
-- fresh installs bootstrapped from db/schema.sql — that already have these.

-- Add page_templates.header_id only if the column is missing.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'page_templates' AND column_name = 'header_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE page_templates ADD COLUMN header_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add page_templates.footer_id only if the column is missing.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'page_templates' AND column_name = 'footer_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE page_templates ADD COLUMN footer_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add the header FK only if it does not already exist.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'page_templates'
    AND constraint_name = 'fk_pt_header' AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE page_templates ADD CONSTRAINT fk_pt_header FOREIGN KEY (header_id) REFERENCES headers(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add the footer FK only if it does not already exist.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'page_templates'
    AND constraint_name = 'fk_pt_footer' AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE page_templates ADD CONSTRAINT fk_pt_footer FOREIGN KEY (footer_id) REFERENCES footers(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS page_template_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_template_id INT NOT NULL,
  section_type_id INT NOT NULL,
  sort_order INT DEFAULT 0,
  CONSTRAINT fk_pts_template FOREIGN KEY (page_template_id) REFERENCES page_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_pts_section_type FOREIGN KEY (section_type_id) REFERENCES section_types(id) ON DELETE CASCADE
);
