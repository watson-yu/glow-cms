-- Migration: Add per-page SEO metadata columns
-- Issue #88

ALTER TABLE pages
  ADD COLUMN meta_title VARCHAR(255) DEFAULT NULL,
  ADD COLUMN meta_description TEXT DEFAULT NULL,
  ADD COLUMN og_image VARCHAR(1024) DEFAULT NULL,
  ADD COLUMN canonical VARCHAR(1024) DEFAULT NULL;
