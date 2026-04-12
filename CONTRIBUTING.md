# Contributing

## Before You Start

- Read [AGENT.md](./AGENT.md) for the current architecture and conventions.
- Keep changes focused. This project is still evolving quickly.
- Do not introduce `.env`-based setup. Glow CMS intentionally stores runtime configuration in MySQL, with local DB bootstrap handled through the app and checked-in schema.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Bootstrap MySQL with the checked-in schema:

```bash
mysql -u root -p < db/schema.sql
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000/cms-admin`.

## Development Notes

- Framework: Next.js App Router
- Language: plain JavaScript, no TypeScript
- Database access: raw SQL via `mysql2/promise`
- Styling: plain CSS in `app/globals.css`
- Admin UI: client-side React

## Contribution Guidelines

- Follow the existing file structure and naming patterns.
- Prefer small, reviewable pull requests.
- Update documentation when behavior, schema, routes, or setup changes.
- If you add or change database tables, update `db/schema.sql` and any related docs.
- Do not commit secrets, database dumps with live data, or private credentials.

## Pull Requests

- Explain the user-facing or architectural change clearly.
- Mention any schema changes, setup changes, or manual verification steps.
- Include screenshots for admin UI changes when relevant.

