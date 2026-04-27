# AGENT.md — Glow CMS System Design

This document is for AI coding agents working on this codebase. It describes the architecture, conventions, and design decisions.

## Architecture Overview

Glow CMS is a Next.js 16 App Router application with a MySQL backend. There is no ORM — all database access uses raw SQL via `mysql2/promise`. The admin UI is entirely client-side React ("use client") that calls REST API routes. Public-facing pages are server-rendered.

### Key Architectural Decisions

- **No ORM**: All queries are raw SQL in API route handlers and `lib/pages.js`
- **Optional auth**: Admin routes require Google sign-in when `google_client_id`, `google_client_secret`, and `nextauth_secret` are all set in `system_config`
- **No component library**: All UI is plain HTML/CSS with a custom design system in `globals.css`
- **Template engine**: Simple `{{variable}}` regex replacement, not a full template language
- **Config in DB**: Both site config and system config are stored in MySQL, not env vars (except DB connection)
- **DB credentials in `.db-config.json`**: Local file (gitignored), never stored in `system_config`
- **Live section templates**: Section content is rendered from `section_types.default_content` at render time, not frozen copies

## Database Schema

12 tables in `glow_cms`:

| Table | Purpose |
|---|---|
| `categories` | 2-level category tree (parent_id self-reference, CASCADE delete) |
| `pages` | Content pages with title, slug, status, header/footer/template/category references |
| `headers` | Header HTML templates (name + content) |
| `footers` | Footer HTML templates (name + content) |
| `page_templates` | Page layout templates with `{{content}}` placeholder |
| `sections` | Page content blocks, ordered, linked to page + section_type, with variables JSON |
| `section_types` | Reusable section definitions with default_content and variables JSON |
| `site_config` | Key-value pairs for public site settings (title, logo, paths, custom variables) |
| `system_config` | Key-value pairs for system settings (AWS keys, LLM API keys, external DB config) |
| `prompts` | Versioned prompts with scope_type/scope_key/version/is_active |
| `users` | Admin users created via Google sign-in, with role and last login tracking |
| `generation_logs` | Stored AI generation requests/responses with prompt version references |

### Relationships

```
categories.parent_id → categories.id (CASCADE delete, max 2 levels)
pages.header_id → headers.id
pages.footer_id → footers.id
pages.page_template_id → page_templates.id
pages.category_id → categories.id (SET NULL on delete)
sections.page_id → pages.id (CASCADE delete)
sections.section_type_id → section_types.id
```

### Section Variables

- `section_types.variables` — JSON array of `[{key, label, type}]` defining available variables
  - `type: "prompt"` — editor auto-generates value via LLM from label (supports `{{category}}` substitution)
  - `type: "fixed"` — editor auto-fills with the label text directly
  - At render time, fixed variables are synthesized from `section_types.variables` labels as defaults, then overridden by any stored `sections.variables` values. Prompt variables rely solely on stored values.
- `sections.variables` — JSON object `{key: value}` storing per-page variable values

## Template Variable System

Content in headers, footers, page templates, and sections can contain `{{variable_name}}` placeholders. These are substituted at render time (never stored substituted).

Substitution order for sections:
1. Section variables (`sections.variables`) are substituted first
2. Site config variables are substituted second

The substitution function is in `lib/template.js`:
```js
export function substituteVars(template, config) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => config[key] ?? `{{${key}}}`);
}
```

### Page Rendering Flow (`lib/pages.js` → `getPageBySlug`)

1. Fetch page with header, footer, page template content
2. Fetch sections with `section_types.default_content` (live template)
3. For each section: substitute section variables → substitute site config
4. Assemble all section HTML into page template via `{{content}}`
5. Substitute site config into the assembled body
6. Return `header_content`, `body_content`, `footer_content`

`PageView.js` renders: header → body_content → footer (no hardcoded layout wrapper).

## Category System

2-level tree: top-level categories with child subcategories.

- Syncs from external database (configurable queries in system config)
- External schema: `categories` → L1, `treatments` via `category_treatment` → L2
- Local ID scheme for L2: `category_id * 100000 + treatment_id` (handles many-to-many)
- Categories admin page: tree view with collapse/expand, tri-state checkboxes, batch page creation

## Prompt Management System

3-level hierarchy, all in one `prompts` table:

| Level | scope_type | scope_key examples | When applied |
|---|---|---|---|
| System | `system` | `system` | Every LLM generation |
| Object Type | `object_type` | `header`, `footer`, `page_template`, `section_type` | All items of that type |
| Object | `object` | `header:1`, `footer:3`, `page_template:1` | That specific item only |

### Versioning

Each scope_key can have multiple versions. Only one is `is_active = 1` at a time. Saving a new prompt creates a new version and deactivates the old one. Users can reactivate any previous version.

### Generation Flow (`/api/generate`)

1. Build system prompt: `system` + `{objectType}` + `{objectType}:{objectId}` (all active versions, concatenated)
2. Build user message: `"Current template:\n{currentHtml}\n\nRequest: {prompt}"`
3. Call selected LLM provider (openai/claude/gemini)
4. Optionally include an attached image (base64) for vision-capable generation
5. Return generated HTML

**Note:** The API route only combines `currentHtml` and `prompt` into the user message. Any additional context (e.g. section variable definitions) is appended to the `prompt` field client-side by `TemplateManager.js` before the request is sent. The same endpoint is also used by the page editor to auto-generate section variable values — in that case the prompt requests JSON output, not HTML (see `pages/[id]/edit/page.js`).

## URL Routing

| Route | Purpose |
|---|---|
| `/cms-admin` | Admin pages list |
| `/cms-admin/categories` | Category tree management |
| `/cms-admin/headers` | Header template editor |
| `/cms-admin/footers` | Footer template editor |
| `/cms-admin/page-templates` | Page template editor |
| `/cms-admin/section-types` | Section type management + page variables |
| `/cms-admin/pages/[id]` | Page view |
| `/cms-admin/pages/[id]/edit` | Page edit form |
| `/cms-admin/prompts` | Prompt review + version history |
| `/cms-admin/users` | Admin user directory |
| `/cms-admin/generation-logs` | AI generation audit log |
| `/cms-admin/site-config` | Site settings + custom variables |
| `/cms-admin/system-config` | System settings + LLM keys + external DB + system prompt |
| `/preview/[slug]` | Preview any page (draft or published) |
| `/[...slug]` | Public page catch-all (respects content_path prefix) |

### Content Path Logic

The `content_path` site config value controls public page URLs:
- If `content_path = /guides` → page with slug `how-to` is at `/guides/how-to`
- If `content_path` is empty or `/` → page is at `/how-to`
- Preview is always at `/preview/{slug}` regardless of content_path

The catch-all `[...slug]/page.js` strips the content_path prefix to find the page slug.

**Note:** The public route uses catch-all `[...slug]` (multi-segment), but the preview route uses `[slug]` (single segment only). Page slugs must be single segments (no slashes) for preview to work.

## API Routes

All API routes are in `app/api/`. Standard pattern:

```
GET    /api/{resource}        → list all
POST   /api/{resource}        → create
GET    /api/{resource}/[id]   → get one
PUT    /api/{resource}/[id]   → update
DELETE /api/{resource}/[id]   → delete
```

Special routes:
- `GET/POST /api/auth/[...nextauth]` — NextAuth Google sign-in
- `GET/POST /api/db-setup` — DB connection validation + local config persistence
- `GET /api/categories` — list as tree (parents with children array)
- `POST /api/categories` — create (enforces max 2 levels)
- `PUT/DELETE /api/categories/[id]` — update/delete
- `POST /api/categories/sync` — sync from external database
- `POST /api/categories/clear` — delete all categories
- `GET /api/users` — list admin users from `users`
- `GET /api/generation-logs` — list the latest 100 AI generations
- `GET/PUT /api/site-config` — bulk key-value get/set
- `POST /api/site-config/delete` — delete a single site config key
- `GET/PUT /api/system-config` — bulk key-value get/set (secrets masked on GET)
- `GET /api/prompts?scope_key=xxx` — get active prompt + version history
- `POST /api/prompts` — save new version (auto-deactivates old)
- `PUT /api/prompts` — activate a specific version
- `GET /api/prompts/all` — list all scope_keys with summary
- `POST /api/generate` — LLM generation (accepts provider, prompt, currentHtml, objectType, objectKey, imageData)
- `POST/DELETE /api/upload` — S3 file upload/delete

### Secret Masking

`system_config` API masks secret keys on GET (shows `••••••••` + last 4 chars). The masked keys are defined in `SECRET_KEYS` array in the route handler. On PUT, empty values for secret keys are skipped (preserves existing value).

### Auth Flow

If `google_client_id`, `google_client_secret`, and `nextauth_secret` are set in `system_config`, the admin shell requires a NextAuth Google session. Successful sign-ins are allowlist-checked against `allowed_logins` and then upserted into `users` with `last_login = NOW()`.

## Admin UI Components

### TemplateManager (`components/TemplateManager.js`)

Shared editor used by headers, footers, page templates, and section types. Props:
- `apiPath` — API endpoint (e.g. `/api/headers`)
- `contentField` — field name for content (default: `content`)
- `title` — page title
- `objectType` — for prompt scoping (e.g. `header`, `footer`, `page_template`, `section_type`)
- `renderPreview` — optional custom preview renderer (used by page templates to show header + template + footer)
- `showVariables` — show Page Variables editor (used by section types)

Layout:
1. Row 1: title + dropdown selector + Add New button
2. Row 2: name input + Save (name only) + Delete
3. Preview card (blue dashed border)
4. Editor grid: template source + Save (left) + AI generate with image upload (right)
5. Page Variables editor (section types only): key + Prompt/Fixed toggle + label/prompt text
6. Prompt editors: type-level (left) + object-level (right)

### PromptEditor (`components/PromptEditor.js`)

Versioned prompt editor widget. Props: `scopeType`, `scopeKey`, `label`. Shows textarea, save button with version number, version dropdown to switch active version.

### AdminShell (`AdminShell.js`)

Sidebar + header layout. Fetches site config for logo/title. Sidebar sections: Content (Pages, Categories), Components, Settings — divided by border lines.

## CSS Conventions

All styles in `app/globals.css`. Key classes:
- `.admin-header`, `.admin-sidebar`, `.admin-main` — layout (main has `overflow-y: auto`)
- `.card`, `.card-title` — content cards
- `.form-field`, `.form-input` — form elements
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm` — buttons
- `.badge`, `.badge-draft`, `.badge-published` — status badges
- `.page-header` — page title row (flex, space-between)
- `.table-wrap`, `table` — data tables
- `.template-preview` — blue dashed preview container
- `.template-editor-grid` — 2-column grid at 1040px+ (800px main pane)
- `.system-config-grid` — same 2-column grid for config pages
- `.var-tag` — clickable variable pill (e.g. `{{site_title}}`)
- `.config-ref` — reference info bar
- `.prompt-versions`, `.prompt-version` — prompt history UI

## Coding Conventions

- All admin pages are `"use client"` components
- API routes use `NextResponse.json()` for responses
- `async function GET/POST/PUT/DELETE` exports in route files
- Dynamic route params accessed via `const { id } = await params`
- `export const dynamic = "force-dynamic"` on server-rendered pages
- No TypeScript — all plain JavaScript with JSX
- Minimal dependencies — no state management library, no CSS framework
- DB credentials stored in `.db-config.json` (gitignored), loaded by `lib/db.js`
- Per-section save buttons on config pages (site config, system config)
