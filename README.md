# Glow CMS

An AI-powered content management system built with Next.js 16 and MySQL. Glow CMS lets you manage pages, headers, footers, and page templates — with built-in LLM integration (OpenAI, Anthropic, Gemini) to generate HTML templates from natural language prompts.

## Features

- **Page management** — create, edit, publish pages with configurable URL paths
- **Template system** — headers, footers, and page templates with `{{variable}}` substitution from site config
- **AI content generation** — generate HTML templates using OpenAI, Anthropic, or Gemini directly from the admin UI
- **3-level prompt management** — system, object-type, and object-level prompts with version history
- **Section types** — reusable content blocks with default templates
- **S3 image uploads** — logo and media uploads to AWS S3
- **Live preview** — preview pages at `/preview/{slug}` (works for drafts too)
- **Configurable content paths** — set a prefix like `/guides` so pages appear at `/guides/{slug}`

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: MySQL 8 (via `mysql2`)
- **LLM SDKs**: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`
- **Storage**: AWS S3 (`@aws-sdk/client-s3`)
- **Styling**: Plain CSS (no framework)

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8 database
- (Optional) AWS S3 bucket for uploads
- (Optional) API key for at least one LLM provider

### 1. Clone and install

```bash
git clone <repo-url>
cd glow-cms
npm install
```

### 2. Configure environment

Create `.env.local`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=glow_cms
DB_PORT=3306
```

### 3. Set up the database

Run the SQL schema to create all tables:

```sql
CREATE DATABASE glow_cms;
USE glow_cms;

CREATE TABLE site_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT
);

CREATE TABLE system_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT
);

CREATE TABLE headers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE footers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE page_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE section_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  default_content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('draft','published') DEFAULT 'draft',
  header_id INT,
  footer_id INT,
  page_template_id INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_id INT NOT NULL,
  section_type_id INT NOT NULL,
  content TEXT,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (section_type_id) REFERENCES section_types(id)
);

CREATE TABLE prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope_type ENUM('system','object_type','object') NOT NULL,
  scope_key VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  content TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scope (scope_key, is_active)
);

-- Seed data
INSERT INTO page_templates (name, content) VALUES ('Default', '<div class="page-content">{{content}}</div>');
INSERT INTO prompts (scope_type, scope_key, version, content, is_active) VALUES
  ('system', 'system', 1, 'You are an HTML template generator for a CMS. Generate clean, semantic HTML. Use {{variable}} placeholders for dynamic values from site config. Return ONLY HTML, no markdown fences, no explanation.', 1);
```

### 4. Run

```bash
npm run dev
```

- **Admin**: http://localhost:3000/cms-admin
- **Public pages**: http://localhost:3000/{content_path}/{slug}
- **Preview**: http://localhost:3000/preview/{slug}

### 5. Configure in the admin

1. **System Config** — set AWS S3 credentials, LLM API keys
2. **Site Config** — set site title, logo, content path prefix, copyright, etc.
3. **Headers/Footers** — create templates using `{{variable}}` placeholders
4. **Page Templates** — define page layouts (preview shows header + template + footer)
5. **Pages** — create pages, assign header/footer/template, add sections, publish

## Project Structure

```
glow-cms/
├── app/
│   ├── cms-admin/              # Admin UI
│   │   ├── AdminShell.js       # Sidebar + header layout
│   │   ├── layout.js           # Admin layout with dynamic metadata
│   │   ├── page.js             # Pages list
│   │   ├── components/
│   │   │   ├── TemplateManager.js  # Shared editor for headers/footers/templates
│   │   │   └── PromptEditor.js     # Versioned prompt editor widget
│   │   ├── headers/            # Header template editor
│   │   ├── footers/            # Footer template editor
│   │   ├── page-templates/     # Page template editor
│   │   ├── pages/              # Page CRUD + edit form
│   │   ├── section-types/      # Section type management
│   │   ├── prompts/            # Prompt review + version history
│   │   ├── site-config/        # Site-level settings
│   │   └── system-config/      # System settings + LLM keys + system prompt
│   ├── api/                    # REST API routes
│   │   ├── pages/              # CRUD
│   │   ├── headers/            # CRUD
│   │   ├── footers/            # CRUD
│   │   ├── page-templates/     # CRUD
│   │   ├── section-types/      # CRUD
│   │   ├── site-config/        # GET/PUT
│   │   ├── system-config/      # GET/PUT (secrets masked)
│   │   ├── prompts/            # GET/POST/PUT + /all
│   │   ├── generate/           # LLM generation endpoint
│   │   └── upload/             # S3 upload/delete
│   ├── [...slug]/              # Public page catch-all route
│   ├── preview/[slug]/         # Preview route (any status)
│   └── components/
│       └── PageView.js         # Public page renderer
├── lib/
│   ├── db.js                   # MySQL connection pool
│   ├── pages.js                # Page queries + variable substitution
│   └── template.js             # {{variable}} substitution utility
└── globals.css                 # All styles
```

## Template Variables

Headers, footers, page templates, and section content support `{{variable}}` placeholders that are substituted at render time from site config values:

| Variable | Source |
|---|---|
| `{{site_title}}` | Site Config |
| `{{logo_url}}` | Site Config |
| `{{copyright_text}}` | Site Config |
| `{{privacy_link}}` | Site Config |
| `{{terms_link}}` | Site Config |
| `{{content_path}}` | Site Config |
| `{{content}}` | Page template only — replaced with page sections |

## AI Generation

The template editor includes an AI generation panel. When you click "Generate":

1. The system prompt (from System Config) is loaded
2. The object-type prompt (e.g. "header") is appended if set
3. The object-specific prompt (e.g. "header:1") is appended if set
4. Your ad-hoc prompt + current HTML are sent as the user message
5. The LLM returns HTML that replaces the template source

Supported providers: OpenAI (gpt-4o-mini), Anthropic (claude-sonnet-4-20250514), Gemini (gemini-2.5-flash).

## License

MIT
