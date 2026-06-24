# AGENT.md — Glow CMS System Design

This document is for AI coding agents working on this codebase. It describes the architecture, conventions, and design decisions.

## Architecture Overview

Glow CMS is a Next.js 16 App Router application with a MySQL backend. There is no ORM — all database access uses raw SQL via `mysql2/promise`. The admin UI is entirely client-side React ("use client") that calls REST API routes. Public-facing pages are server-rendered.

### Key Architectural Decisions

- **No ORM**: All queries are raw SQL in API route handlers and `lib/pages.js`
- **Optional auth, enforced server-side**: Admin routes require an allow-listed Google sign-in once OAuth is configured in `system_config`. Enforcement is server-side (`proxy.js` + `lib/auth.js`), never client-only — see "Auth Flow" below.
- **No component library**: All UI is plain HTML/CSS with a custom design system in `globals.css`
- **Template engine**: Simple `{{variable}}` regex replacement, not a full template language
- **Config in DB**: Both site config and system config are stored in MySQL, not env vars (except DB connection)

## Database Schema

11 tables in `glow_cms`:

| Table | Purpose |
|---|---|
| `pages` | Content pages with title, slug, status, header/footer/template references |
| `headers` | Header HTML templates (name + content) |
| `footers` | Footer HTML templates (name + content) |
| `page_templates` | Page layout templates with `{{content}}` placeholder |
| `sections` | Page content blocks, ordered, linked to page + section_type |
| `section_types` | Reusable section definitions with default_content |
| `site_config` | Key-value pairs for public site settings (title, logo, paths, etc.) |
| `system_config` | Key-value pairs for system settings (AWS keys, DB config, LLM API keys) |
| `prompts` | Versioned prompts with scope_type/scope_key/version/is_active |
| `users` | Admin users created via Google sign-in, with role and last login tracking |
| `generation_logs` | Stored AI generation requests/responses with prompt version references |

### Relationships

```
pages.header_id → headers.id
pages.footer_id → footers.id
pages.page_template_id → page_templates.id
sections.page_id → pages.id (CASCADE delete)
sections.section_type_id → section_types.id
```

## Template Variable System

Content in headers, footers, page templates, and sections can contain `{{variable_name}}` placeholders. These are substituted at render time (never stored substituted) using values from the `site_config` table.

The substitution function is in `lib/template.js`:
```js
export function substituteVars(template, config) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => config[key] ?? `{{${key}}}`);
}
```

- Server-side: `lib/pages.js` → `getPageBySlug()` fetches config and substitutes before returning
- Client-side: `TemplateManager.js` imports `substituteVars` for live preview
- Admin page view: fetches config client-side and substitutes before rendering

Page templates additionally carry a `{{content}}` placeholder where assembled section HTML is injected. Use `injectContent(template, html)` from `lib/template.js` for this — **never** `String.prototype.replace("{{content}}", html)`. A string second argument makes JS interpret `$`-sequences in the section HTML (`$$`→`$`, `$&`→matched text), silently corrupting prices/jQuery/regex/templating, and only replaces the first placeholder. `injectContent` uses a function replacement + `replaceAll` to avoid both.

## Prompt Management System

3-level hierarchy, all in one `prompts` table:

| Level | scope_type | scope_key examples | When applied |
|---|---|---|---|
| System | `system` | `system` | Every LLM generation |
| Object Type | `object_type` | `header`, `footer`, `page_template` | All items of that type |
| Object | `object` | `header:1`, `footer:3`, `page_template:1` | That specific item only |

### Versioning

Each scope_key can have multiple versions. Only one is `is_active = 1` at a time. Saving a new prompt creates a new version and deactivates the old one. Users can reactivate any previous version.

### Generation Flow (`/api/generate`)

1. Build system prompt: `system` + `{objectType}` + `{objectType}:{objectId}` (all active versions, concatenated)
2. Build user message: current HTML template + user's ad-hoc prompt
3. Call selected LLM provider (openai/claude/gemini)
4. Return generated HTML

## URL Routing

| Route | Purpose |
|---|---|
| `/cms-admin` | Admin pages list |
| `/cms-admin/headers` | Header template editor |
| `/cms-admin/footers` | Footer template editor |
| `/cms-admin/page-templates` | Page template editor |
| `/cms-admin/section-types` | Section type CRUD |
| `/cms-admin/pages/[id]` | Page view |
| `/cms-admin/pages/[id]/edit` | Page edit form |
| `/cms-admin/prompts` | Prompt review + version history |
| `/cms-admin/users` | Admin user directory |
| `/cms-admin/generation-logs` | AI generation audit log |
| `/cms-admin/site-config` | Site settings |
| `/cms-admin/system-config` | System settings + LLM keys + system prompt |
| `/preview/[slug]` | Preview any page (draft or published) |
| `/[...slug]` | Public page catch-all (respects content_path prefix) |

### Content Path Logic

The `content_path` site config value controls public page URLs:
- If `content_path = /guides` → page with slug `how-to` is at `/guides/how-to`
- If `content_path` is empty or `/` → page is at `/how-to`
- Preview is always at `/preview/how-to` regardless of content_path

The catch-all `[...slug]/page.js` strips the content_path prefix to find the page slug.

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
- `GET /api/auth/config` — public, secret-free auth status (`{ dbConfigured, authRequired }`) used by the admin shell; stays reachable when other routes are gated
- `GET/POST /api/db-setup` — DB connection validation + local config persistence
- `GET /api/users` — list admin users from `users`
- `GET /api/generation-logs` — list the latest 100 AI generations
- `GET/PUT /api/site-config` — bulk key-value get/set
- `GET/PUT /api/system-config` — bulk key-value get/set (secrets masked on GET)
- `GET /api/prompts?scope_key=xxx` — get active prompt + version history
- `POST /api/prompts` — save new version (auto-deactivates old)
- `PUT /api/prompts` — activate a specific version
- `GET /api/prompts/all` — list all scope_keys with summary
- `POST /api/generate` — LLM generation (accepts provider, prompt, currentHtml, objectType, objectKey)
- `POST/DELETE /api/upload` — S3 file upload/delete

### Upload Validation

`POST /api/upload` accepts image logo uploads only. Validation lives in `lib/uploadValidation.js` (`validateImageUpload`), kept separate from the route so it is unit-testable (`lib/uploadValidation.test.js`, Vitest). Rules:
- Allowed extensions: `png`, `jpg`/`jpeg`, `webp`. Max size 5 MB (checked via `file.size` before buffering).
- **SVG is intentionally disallowed** — it is XML that can carry inline `<script>`/external refs, so serving attacker-supplied SVG from our bucket is a stored-XSS vector. We reject rather than ship a sanitizer.
- The stored S3 `ContentType` is derived from the validated extension, never from the client-supplied MIME type (spoofable). The S3 key uses only the validated extension, never the raw filename.
- Filenames with no real extension are rejected (so a missing dot can't become the whole key).

### Secret Masking

`system_config` API masks secret keys on GET (shows `••••••••` + last 4 chars). The masked keys are defined in `SECRET_KEYS` array in the route handler. On PUT, empty values for secret keys are skipped (preserves existing value).

### Auth Flow

Authentication is enforced **server-side**. The client `AdminShell` still renders a
login screen, but it is cosmetic — the real gate lives in `proxy.js` and `lib/auth.js`
and is re-evaluated on every request. Never rely on the client for access control.

**Where the gate runs**

- `proxy.js` (repo root) — Next.js 16 "proxy", the **Node.js-runtime** successor to
  `middleware.js`. It must run on Node (not Edge) because the OAuth secret and the
  allow-list live in MySQL, which Edge cannot reach; the `proxy.js` filename
  guarantees the Node runtime (a `middleware.js` would run on Edge and could not read
  the DB). It matches `/api/:path*`, `/cms-admin/:path*`, and `/preview/:path*`,
  skips `/api/auth/*`, and — when OAuth is configured — requires a valid, allow-listed
  session: 401 for API routes, redirect to `/cms-admin` for pages/previews.
- `requireAuth(req)` in `lib/auth.js` — defense-in-depth guard called at the top of
  the high-risk route handlers (`system-config`, `db-setup`, `upload`, `generate`,
  `categories/sync`). It re-derives the auth state from the DB independently of the
  proxy.
- `getServerSession()` — used by the `/preview/[slug]` Server Component to block
  drafts from anonymous viewers.

**"Configured" vs "open"**

- OAuth counts as **configured** only when `google_client_id`, `google_client_secret`,
  and `nextauth_secret` are all set in `system_config`. This boolean is computed
  server-side (`isOAuthConfigured()`) and exposed, secret-free, at
  `GET /api/auth/config` for the admin shell to render the right screen.
- When OAuth is **not** configured the instance is inherently **open** (the
  initial-setup state). The resource/secret routes `upload`, `generate`, and
  `categories/sync` still **fail closed** (deny) even then. The two bootstrap routes
  `system-config` and `db-setup` are allowed while unconfigured (`allowBootstrap`) so
  the instance can be set up in the first place — they re-lock the moment OAuth is
  configured.

> ⚠️ **Operational requirement:** Configure Google OAuth (and at least one
> `allowed_logins` entry) **before exposing the instance to any untrusted network.**
> An unconfigured instance is open by design; perform first-run setup on localhost or
> a trusted network only.

**Allow-list (`isEmailAllowed`)**

Sign-ins and every request are allow-list-checked against `allowed_logins` (one rule
per line; `@domain.tld` matches a whole domain, anything else is an exact, case-
insensitive address match). The check **fails closed**: an empty/blank `allowed_logins`
denies everyone (it never grants admin to any Google account). So after enabling OAuth
you must add at least one allow-list entry before anyone can sign in. Successful
sign-ins are upserted into `users` with `last_login = NOW()`.

**`NEXTAUTH_URL`**

The NextAuth base URL is taken from the deploy-time `NEXTAUTH_URL` env var and is
**never** derived from an arbitrary `Host`/`X-Forwarded-Host` header (host-header
injection). If auto-detection is needed, set `NEXTAUTH_TRUSTED_HOSTS` (comma-separated)
and only an allow-listed host will be accepted.

## Admin UI Components

### TemplateManager (`components/TemplateManager.js`)

Shared editor used by headers, footers, and page templates. Props:
- `apiPath` — API endpoint (e.g. `/api/headers`)
- `contentField` — field name for content (default: `content`)
- `title` — page title
- `objectType` — for prompt scoping (e.g. `header`, `footer`, `page_template`)
- `renderPreview` — optional custom preview renderer (used by page templates to show header + template + footer)

Layout:
1. Row 1: title + dropdown selector + Add New button
2. Row 2: name input + Save (name only) + Delete
3. Preview card (blue dashed border)
4. Editor grid: template source (left) + AI generate (right)
5. Prompt editors: type-level (left) + object-level (right)

### PromptEditor (`components/PromptEditor.js`)

Versioned prompt editor widget. Props: `scopeType`, `scopeKey`, `label`. Shows textarea, save button with version number, version dropdown to switch active version.

### AdminShell (`AdminShell.js`)

Sidebar + header layout. Fetches site config for logo/title. Sidebar sections: Content, Components, Settings — divided by border lines.

## CSS Conventions

All styles in `app/globals.css`. Key classes:
- `.admin-header`, `.admin-sidebar`, `.admin-main` — layout
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

## Database Writes & Transactions

Any API handler that issues **more than one** dependent write (delete-then-insert,
create-then-insert, etc.) MUST run them atomically via the `withTransaction(fn)`
helper in `lib/db.js` — never as separate `pool.query()` calls (mysql2 autocommits,
so a mid-sequence failure leaves data half-written). `fn` receives a dedicated
connection; the helper commits on success, rolls back on any throw, and always
releases the connection. Examples: page section replacement, page create +
sections, page-template section replacement.

`page_template_sections` is migration-gated: it may not exist yet on older
deployments. Before reading or writing it, guard with `tableExists(conn, "page_template_sections")`
(or, on the read-only GET handlers, a try/catch) so saving a template / creating
a page still works pre-migration.

## Coding Conventions

- All admin pages are `"use client"` components
- API routes use `NextResponse.json()` for responses
- `async function GET/POST/PUT/DELETE` exports in route files
- Dynamic route params accessed via `const { id } = await params`
- `export const dynamic = "force-dynamic"` on server-rendered pages
- No TypeScript — all plain JavaScript with JSX
- Minimal dependencies — no state management library, no CSS framework

## Testing

- Test runner is [Vitest](https://vitest.dev/). Run with `npm test` (`vitest run`).
- Tests live next to the code as `*.test.js` (e.g. `lib/template.test.js`).
- `vitest.config.js` mirrors the `@/*` → `./*` path alias from `jsconfig.json`, so tests import modules the same way the app does (`@/lib/...`).
- Favor pure, dependency-free units (e.g. `lib/template.js`); avoid tests that need a live MySQL connection.

## Dependencies

- `next` is pinned to an exact version (no `^`), so `npm audit fix` cannot bump it — security patches require editing `package.json` manually and staying on the latest `16.x` patch.
- `@anthropic-ai/sdk` (used by `/api/generate`) is held at `^0.88.0`. The GHSA-p7fg-763f-g4gf advisory (insecure default file permissions in the unused local-FS memory tool, moderate) is only fixed in `0.92.0+`, which is outside the non-breaking range — left as a deliberate follow-up; bumping it requires retesting the Claude generation path.
- Remaining moderate `npm audit` advisories (`postcss`, `uuid` via `next-auth`) are pinned transitive deps of `next`/`next-auth` and can't be cleared without breaking-change upgrades.
