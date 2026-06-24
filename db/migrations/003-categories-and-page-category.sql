-- Migration: Add categories table, pages.category_id, and the FK linking them.
-- Fixes schema/migration drift: db/schema.sql already defined these but no
-- migration created them. Written idempotently (information_schema guards +
-- CREATE TABLE IF NOT EXISTS) so it is a no-op on databases — including fresh
-- installs bootstrapped from schema.sql — that already have them.

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  parent_id INT DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Add pages.category_id only if the column is missing (MySQL lacks
-- ADD COLUMN IF NOT EXISTS, so guard via information_schema + dynamic SQL).
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'category_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE pages ADD COLUMN category_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add the FK only if it does not already exist.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'pages'
    AND constraint_name = 'fk_pages_category' AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE pages ADD CONSTRAINT fk_pages_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
