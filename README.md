# Glow CMS

Glow CMS is an AI-powered content management system built with Next.js 16 and MySQL. It manages pages, headers, footers, page templates, reusable section types, and prompt-driven generation with OpenAI, Anthropic, and Gemini.

## What It Is

Glow is designed for structured site production:
- a 2-level category tree can define the site structure
- headers, footers, and page templates define the shell
- section types define reusable content modules
- prompts define generation behavior
- pages combine all of that into public routes

## Features

- Page management with draft/published status
- 2-level category tree with optional external DB sync
- Header, footer, and page template system with `{{variable}}` substitution
- Reusable section types with fixed or prompt-driven variables
- Live section templates that update existing pages at render time
- AI generation with OpenAI, Anthropic, and Gemini
- Versioned prompts at system, object-type, and object levels
- Generation logs for review and audit
- Optional Google admin sign-in via NextAuth
- AWS S3 uploads for logo and media

## Tech Stack

- Next.js 16 App Router
- MySQL 8 via `mysql2`
- `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`
- AWS S3 via `@aws-sdk/client-s3`
- Plain CSS

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8
- Optional AWS S3 bucket
- Optional API key for at least one LLM provider

### Install

```bash
git clone <repo-url>
cd glow_cms
npm install
```

### Database

Run the bootstrap schema:

```bash
mysql -u root -p < db/schema.sql
```

You can configure DB access either with the admin DB Setup screen on first run (credentials are saved to `.db-config.json`, gitignored), or with `.env.local` which takes priority when present:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=glow_cms
DB_PORT=3306
```

### Run

```bash
npm run dev
```

- Admin: `http://localhost:3000/cms-admin`
- Public pages: `http://localhost:3000/{content_path}/{slug}`
- Preview: `http://localhost:3000/preview/{slug}`

### First Admin Steps

1. Configure `System Config` with LLM keys, optional auth, and optional external category DB settings.
2. Configure `Site Config` with branding, `content_path`, legal links, and custom site variables.
3. Build or sync the 2-level category tree.
4. Create headers, footers, page templates, and section types.
5. Create or batch-create pages from categories.

## Documentation

- [docs/building-sites.md](docs/building-sites.md): site-building workflow, prompts, variables, and existing-page update rules
- [docs/architecture.md](docs/architecture.md): runtime call flow, system design, project structure, and API layout

## License

MIT
