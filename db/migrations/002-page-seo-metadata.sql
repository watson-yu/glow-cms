-- Migration: Add per-page SEO metadata columns
-- Issue #88
--
-- Written idempotently (information_schema guards + dynamic SQL for conditional
-- ADD COLUMN, since MySQL lacks ADD COLUMN IF NOT EXISTS) so it is a no-op on
-- databases — including fresh installs bootstrapped from db/schema.sql — that
-- already have these columns.

-- Add pages.meta_title only if the column is missing.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'meta_title'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE pages ADD COLUMN meta_title VARCHAR(255) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add pages.meta_description only if the column is missing.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'meta_description'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE pages ADD COLUMN meta_description TEXT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add pages.og_image only if the column is missing.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'og_image'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE pages ADD COLUMN og_image VARCHAR(1024) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add pages.canonical only if the column is missing.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'canonical'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE pages ADD COLUMN canonical VARCHAR(1024) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
