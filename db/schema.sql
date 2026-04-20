CREATE DATABASE IF NOT EXISTS glow_cms;
USE glow_cms;

CREATE TABLE IF NOT EXISTS site_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT
);

CREATE TABLE IF NOT EXISTS system_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT
);

CREATE TABLE IF NOT EXISTS headers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS footers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS section_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  default_content TEXT,
  variables JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('draft','published') DEFAULT 'draft',
  header_id INT DEFAULT NULL,
  footer_id INT DEFAULT NULL,
  page_template_id INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  category_id INT DEFAULT NULL,
  CONSTRAINT fk_pages_header FOREIGN KEY (header_id) REFERENCES headers(id),
  CONSTRAINT fk_pages_footer FOREIGN KEY (footer_id) REFERENCES footers(id),
  CONSTRAINT fk_pages_template FOREIGN KEY (page_template_id) REFERENCES page_templates(id),
  CONSTRAINT fk_pages_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_id INT NOT NULL,
  section_type_id INT NOT NULL,
  content TEXT,
  variables JSON DEFAULT NULL,
  sort_order INT DEFAULT 0,
  CONSTRAINT fk_sections_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_sections_type FOREIGN KEY (section_type_id) REFERENCES section_types(id)
);

CREATE TABLE IF NOT EXISTS prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope_type ENUM('system','object_type','object') NOT NULL,
  scope_key VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  content TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scope (scope_key, is_active)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT NULL,
  image TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  last_login TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email (email)
);

CREATE TABLE IF NOT EXISTS generation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  object_type VARCHAR(100) DEFAULT NULL,
  object_key VARCHAR(255) DEFAULT NULL,
  system_prompt_id INT DEFAULT NULL,
  system_prompt_version INT DEFAULT NULL,
  type_prompt_id INT DEFAULT NULL,
  type_prompt_version INT DEFAULT NULL,
  object_prompt_id INT DEFAULT NULL,
  object_prompt_version INT DEFAULT NULL,
  user_prompt TEXT,
  current_html LONGTEXT,
  response_html LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_generation_logs_created_at (created_at),
  INDEX idx_generation_logs_object_key (object_key)
);

INSERT INTO page_templates (id, name, content)
VALUES (1, 'Default', '<div class="page-content">{{content}}</div>')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  content = VALUES(content);

INSERT INTO prompts (scope_type, scope_key, version, content, is_active)
SELECT 'system', 'system', 1, 'You are an HTML template generator for a CMS. Generate clean, semantic HTML. Use {{variable}} placeholders for dynamic values from site config. Return ONLY HTML, no markdown fences, no explanation.', 1
WHERE NOT EXISTS (
  SELECT 1 FROM prompts WHERE scope_type = 'system' AND scope_key = 'system'
);
