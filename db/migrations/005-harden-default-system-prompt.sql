-- Migration: Harden the default `system`/`system` prompt.
--
-- The original v1 seed (db/schema.sql) instructed the model to "Use {{variable}}
-- placeholders for dynamic values from site config." Those placeholders are not
-- defined for generated pages, so the model emitted undefined {{...}} tokens that
-- render as empty strings — dead CTAs and blank elements (issue #87, g3 §2.4).
--
-- schema.sql now seeds the hardened wording, but its INSERT is WHERE NOT
-- EXISTS-guarded, so existing databases keep the old active prompt. This
-- migration upgrades them: it mirrors POST /api/prompts by deactivating the
-- current active row and inserting a new MAX(version)+1 active version with the
-- hardened content.
--
-- Idempotent: it only acts when an active system/system prompt exists whose
-- content differs from the hardened text, so a re-run (or a fresh install whose
-- schema.sql seed already carries the hardened wording) is a clean no-op.

SET @hardened := 'You are an HTML template generator for a CMS. Generate clean, semantic HTML. Do NOT use {{variable}} placeholders or any template tokens (for example {{booking_link}}, {{phone_number}}, {{contact_phone}}) — they are not defined for these pages and render as empty strings, producing dead links and blank elements. Write every value, including calls-to-action, links, and contact details, as plain literal text, or omit it entirely. Never emit the characters {{ or }} anywhere in the output. Return ONLY HTML, no markdown fences, no explanation.';

-- An upgrade is needed only when there is an active system/system prompt whose
-- content is not already the hardened wording.
SET @needs_upgrade := (
  SELECT COUNT(*) FROM prompts
  WHERE scope_type = 'system' AND scope_key = 'system'
    AND is_active = 1 AND content <> @hardened
);

SET @next_version := (
  SELECT COALESCE(MAX(version), 0) + 1 FROM prompts WHERE scope_key = 'system'
);

-- Deactivate the current active row(s) only when an upgrade is needed.
SET @sql := IF(@needs_upgrade > 0,
  'UPDATE prompts SET is_active = 0 WHERE scope_type = ''system'' AND scope_key = ''system''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Insert the hardened content as the new active version.
SET @sql := IF(@needs_upgrade > 0,
  CONCAT(
    'INSERT INTO prompts (scope_type, scope_key, version, content, is_active) VALUES (''system'', ''system'', ',
    @next_version, ', ', QUOTE(@hardened), ', 1)'),
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
