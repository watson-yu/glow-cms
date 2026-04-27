# Glow CMS Architecture

This document covers the system design, runtime call flow, and code layout of Glow CMS.

## Runtime Call Flow

### First Run

1. Open `/cms-admin`.
2. The admin checks `/api/db-setup`.
3. If DB config is missing, the DB setup form is shown.
4. Valid credentials are saved to `.db-config.json`.
5. `lib/db.js` creates the MySQL pool from env vars or `.db-config.json`.

### Admin Boot

1. `AdminShell` loads `site-config` and `system-config`.
2. If `google_client_id`, `google_client_secret`, and `nextauth_secret` are configured, admin access requires Google sign-in.
3. The admin UI then runs client-side and talks to REST routes in `app/api/`.

### Category To Page Flow

1. Build or sync the 2-level category tree.
2. Select categories in `/cms-admin/categories`.
3. Batch-create pages from those categories.
4. Each page inherits the chosen header, footer, page template, status, plus title/slug from the category.

### Page Editing Flow

When editing a page:
1. the page editor loads the page, category tree, section types, templates, and site config
2. adding a section stores its `section_type_id`
3. fixed variables are filled immediately
4. prompt variables can be auto-generated through `/api/generate`
5. saving the page updates `pages`, deletes old `sections`, and re-inserts the current ordered section list

### Public Render Flow

Public requests go through `app/[...slug]/page.js` and `lib/pages.js`:
1. resolve `content_path`
2. resolve the page slug
3. fetch page, header, footer, page template, sections, section type templates, and site config
4. render each section with section variables first and site config variables second
5. join all section HTML
6. replace `{{content}}` in the page template
7. render header, body, footer in `PageView`

The important consequence is that the DB stores structured ingredients, while final HTML is assembled at request time.

## Project Structure

```text
glow_cms/
├── db/
│   └── schema.sql              # Bootstrap database schema (12 tables)
├── app/
│   ├── layout.js               # Root layout
│   ├── page.js                 # Public home / splash page
│   ├── globals.css             # Global styles
│   ├── cms-admin/              # Admin UI
│   │   ├── AdminShell.js       # Sidebar + header layout
│   │   ├── layout.js           # Admin layout with dynamic metadata
│   │   ├── page.js             # Pages list
│   │   ├── categories/         # Category tree management
│   │   ├── components/
│   │   │   ├── TemplateManager.js  # Shared editor for headers/footers/templates/section-types
│   │   │   ├── PromptEditor.js     # Versioned prompt editor widget
│   │   │   ├── AuthProvider.js     # NextAuth session provider
│   │   │   └── DbSetup.js          # First-run DB configuration wizard
│   │   ├── headers/            # Header template editor
│   │   ├── footers/            # Footer template editor
│   │   ├── page-templates/     # Page template editor
│   │   ├── pages/
│   │   │   ├── new/            # New page entry
│   │   │   └── [id]/
│   │   │       ├── page.js     # Page detail / preview in admin
│   │   │       └── edit/       # Page edit form with section variables
│   │   ├── section-types/      # Section type management + page variables
│   │   ├── prompts/            # Prompt review + version history
│   │   ├── users/              # Admin users list
│   │   ├── generation-logs/    # AI generation audit log
│   │   ├── site-config/        # Site-level settings + custom variables
│   │   └── system-config/      # System settings + LLM keys + external DB + system prompt
│   ├── api/                    # REST API routes
│   │   ├── auth/               # NextAuth Google sign-in
│   │   ├── categories/
│   │   │   ├── route.js        # List/create categories
│   │   │   ├── [id]/           # Per-category update/delete
│   │   │   ├── sync/           # External category sync
│   │   │   └── clear/          # Delete all categories
│   │   ├── db-setup/           # Validate/store DB connection config
│   │   ├── pages/
│   │   │   ├── route.js        # List/create pages (with section variables)
│   │   │   └── [id]/           # Get/update/delete one page
│   │   ├── headers/
│   │   │   ├── route.js        # List/create headers
│   │   │   └── [id]/           # Get/update/delete one header
│   │   ├── footers/
│   │   │   ├── route.js        # List/create footers
│   │   │   └── [id]/           # Get/update/delete one footer
│   │   ├── page-templates/
│   │   │   ├── route.js        # List/create page templates
│   │   │   └── [id]/           # Get/update/delete one page template
│   │   ├── section-types/
│   │   │   ├── route.js        # List/create section types
│   │   │   └── [id]/
│   │   │       ├── propagate/  # Apply section-type changes to existing pages
│   │   │       ├── usage/      # List pages using a section type
│   │   │       └── route.js    # Per-section-type CRUD
│   │   ├── users/              # Admin user list
│   │   ├── generation-logs/    # Recent AI generations
│   │   ├── site-config/        # GET/PUT + /delete
│   │   ├── system-config/      # GET/PUT (secrets masked)
│   │   ├── prompts/            # GET/POST/PUT + /all
│   │   ├── generate/           # LLM generation endpoint (with image support)
│   │   └── upload/             # S3 upload/delete
│   ├── [...slug]/              # Public page catch-all route
│   ├── preview/[slug]/         # Preview route (any status)
│   └── components/
│       └── PageView.js         # Public page renderer
├── lib/
│   ├── db.js                   # MySQL connection pool (reads .db-config.json)
│   ├── fmt.js                  # Formatting helpers
│   ├── pages.js                # Page queries + template assembly + variable substitution
│   └── template.js             # {{variable}} substitution utility
```

## Auth And Admin Users

If `google_client_id`, `google_client_secret`, and `nextauth_secret` are present in `system_config`, the admin UI requires Google sign-in through NextAuth.

- Allowed logins are controlled by the `allowed_logins` system config key
- Successful sign-ins upsert a row in `users`
- The Users admin page reads directly from the `users` table
