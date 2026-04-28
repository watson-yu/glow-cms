-- Migration: Add rendered_html snapshot column to pages
-- Issue #59

ALTER TABLE pages ADD COLUMN rendered_html MEDIUMTEXT DEFAULT NULL;
