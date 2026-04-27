-- Migration: Add blueprint support to page_templates
-- Issue #27

ALTER TABLE page_templates
  ADD COLUMN header_id INT DEFAULT NULL,
  ADD COLUMN footer_id INT DEFAULT NULL,
  ADD CONSTRAINT fk_pt_header FOREIGN KEY (header_id) REFERENCES headers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pt_footer FOREIGN KEY (footer_id) REFERENCES footers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS page_template_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_template_id INT NOT NULL,
  section_type_id INT NOT NULL,
  sort_order INT DEFAULT 0,
  CONSTRAINT fk_pts_template FOREIGN KEY (page_template_id) REFERENCES page_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_pts_section_type FOREIGN KEY (section_type_id) REFERENCES section_types(id) ON DELETE CASCADE
);
