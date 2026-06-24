-- Migration: Enforce UNIQUE(scope_key, version) on prompts.
-- Without it, concurrent saves could mint duplicate versions for the same
-- scope_key. The POST /api/prompts handler now also runs the version sequence
-- in a transaction; this constraint is the backstop that makes a racing insert
-- fail loudly instead of silently duplicating.

-- Defensively remove any pre-existing duplicate (scope_key, version) rows,
-- keeping the highest id (most recent) of each group, so the constraint can be
-- added on databases that already accumulated duplicates.
DELETE p1 FROM prompts p1
  INNER JOIN prompts p2
    ON p1.scope_key = p2.scope_key
   AND p1.version = p2.version
   AND p1.id < p2.id;

-- Add the unique key only if it does not already exist (idempotent).
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'prompts'
    AND index_name = 'uniq_scope_version'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE prompts ADD UNIQUE KEY uniq_scope_version (scope_key, version)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
