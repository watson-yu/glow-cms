-- Migration: Extend page status with content pipeline states
-- Issue #55

ALTER TABLE pages MODIFY COLUMN status ENUM('draft','generating','ready_for_review','generation_failed','published') DEFAULT 'draft';
